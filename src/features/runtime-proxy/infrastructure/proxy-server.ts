import * as http from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CircularRingBuffer,
  sanitizeHeaders,
  assertLoopbackHost,
  type MockRoute,
  type TrafficEntry,
  globalEventBus,
} from '../../../shared/kernel/index';
import { RouteTable } from './route-table';
import type { ProxyController } from '../domain/proxy.types';

export const DEFAULT_PROXY_PORT = 45990;

export class RuntimeProxy implements ProxyController {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly routeTable = new RouteTable();
  private readonly trafficLedger = new CircularRingBuffer<TrafficEntry>(100);
  private readonly activeSockets = new Set<Socket>();
  private _port: number;
  private _isRunning: boolean = false;

  constructor(port: number = DEFAULT_PROXY_PORT) {
    this._port = port;
  }

  public get port(): number {
    return this._port;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public addRoute(route: MockRoute): void {
    this.routeTable.set(route);
    globalEventBus.emit('route:upserted', { route });
    this.broadcastWs({ type: 'route:upserted', route });
  }

  public removeRoute(routeId: string): void {
    this.routeTable.delete(routeId);
    globalEventBus.emit('route:deleted', { routeId });
    this.broadcastWs({ type: 'route:deleted', routeId });
  }

  public getRoutes(): MockRoute[] {
    return this.routeTable.getAll();
  }

  public getTraffic(): TrafficEntry[] {
    return this.trafficLedger.getAll();
  }

  public clearTraffic(): void {
    this.trafficLedger.clear();
    this.broadcastWs({ type: 'traffic:cleared' });
  }

  public async start(): Promise<void> {
    if (this._isRunning) {
      return;
    }

    const host = '127.0.0.1';
    assertLoopbackHost(host);

    return new Promise<void>((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.on('connection', (socket: Socket) => {
        this.activeSockets.add(socket);
        socket.on('close', () => {
          this.activeSockets.delete(socket);
        });
      });

      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            type: 'init:state',
            routes: this.getRoutes(),
            traffic: this.getTraffic(),
            port: this._port,
          })
        );
      });

      this.server.on('error', (err) => {
        this._isRunning = false;
        reject(err);
      });

      this.server.listen(this._port, host, () => {
        this._isRunning = true;
        const addr = this.server?.address();
        if (typeof addr === 'object' && addr?.port) {
          this._port = addr.port;
        }
        globalEventBus.emit('proxy:stateChanged', { running: true, port: this._port });
        resolve();
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const url = req.url || '/';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', async () => {
      const requestBody = Buffer.concat(chunks).toString('utf-8');
      const sanitizedReqHeaders = sanitizeHeaders(req.headers as Record<string, string>);

      const matchedRoute = this.routeTable.match(method, url);

      let statusCode = 404;
      let responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      let responseBody: string = JSON.stringify({
        error: 'Not Found',
        message: `MockScope Proxy: No mock route configured for ${method} ${url}`,
      });

      if (matchedRoute) {
        if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
          await new Promise((r) => setTimeout(r, matchedRoute.delayMs));
        }

        statusCode = matchedRoute.statusCode;
        responseHeaders = {
          'Content-Type': 'application/json',
          ...(matchedRoute.headers || {}),
        };
        responseBody =
          typeof matchedRoute.body === 'string'
            ? matchedRoute.body
            : JSON.stringify(matchedRoute.body);
      }

      const durationMs = Date.now() - startTime;
      const sanitizedResHeaders = sanitizeHeaders(responseHeaders);

      const trafficEntry: TrafficEntry = {
        id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: startTime,
        method,
        url,
        requestHeaders: sanitizedReqHeaders,
        requestBody: requestBody || undefined,
        statusCode,
        responseHeaders: sanitizedResHeaders,
        responseBody,
        durationMs,
        isMocked: Boolean(matchedRoute),
        matchedRouteId: matchedRoute?.id,
      };

      this.trafficLedger.push(trafficEntry);
      globalEventBus.emit('traffic:logged', { entry: trafficEntry });
      this.broadcastWs({ type: 'traffic:entry', entry: trafficEntry });

      for (const [key, value] of Object.entries(responseHeaders)) {
        res.setHeader(key, value);
      }
      res.writeHead(statusCode);
      res.end(responseBody);
    });
  }

  private broadcastWs(message: unknown): void {
    if (!this.wss) return;
    const data = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  public async dispose(): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    if (this.wss) {
      for (const client of this.wss.clients) {
        client.terminate();
      }
      this.wss.close();
      this.wss = null;
    }

    for (const socket of this.activeSockets) {
      socket.destroy();
    }
    this.activeSockets.clear();

    await new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });

    this._isRunning = false;
    globalEventBus.emit('proxy:stateChanged', { running: false, port: this._port });
  }
}

export async function startProxy(port: number = DEFAULT_PROXY_PORT): Promise<ProxyController> {
  const proxy = new RuntimeProxy(port);
  await proxy.start();
  return proxy;
}
