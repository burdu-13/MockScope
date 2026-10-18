import * as http from 'node:http';
import { CdpClient } from '../../../shared/cdp/index';
import {
  CircularRingBuffer,
  sanitizeHeaders,
  assertLoopbackHost,
  type MockRoute,
  type TrafficEntry,
  globalEventBus,
} from '../../../shared/kernel/index';
import { RouteTable } from '../../runtime-proxy/index';
import type {
  CdpController,
  ChromeVersionInfo,
  FetchRequestPausedParams,
} from '../domain/cdp.types';

export class CdpBridgeController implements CdpController {
  private client: CdpClient | null = null;
  private readonly routeTable: RouteTable;
  private readonly trafficLedger = new CircularRingBuffer<TrafficEntry>(100);
  private _isAttached = false;
  private unsubscribeFetchPaused: (() => void) | null = null;

  constructor(
    public readonly debugPort: number,
    existingRouteTable?: RouteTable,
    injectedClient?: CdpClient
  ) {
    this.routeTable = existingRouteTable ?? new RouteTable();
    if (injectedClient) {
      this.client = injectedClient;
    }
  }

  public get isAttached(): boolean {
    return this._isAttached && (this.client?.isConnected ?? false);
  }

  public addRoute(route: MockRoute): void {
    this.routeTable.set(route);
  }

  public removeRoute(routeId: string): void {
    this.routeTable.delete(routeId);
  }

  public getRoutes(): MockRoute[] {
    return this.routeTable.getAll();
  }

  public getTraffic(): TrafficEntry[] {
    return this.trafficLedger.getAll();
  }

  public clearTraffic(): void {
    this.trafficLedger.clear();
  }

  public async attach(): Promise<void> {
    if (this._isAttached) return;

    if (!this.client) {
      const wsUrl = await this.discoverWebSocketDebuggerUrl(this.debugPort);
      this.client = new CdpClient(wsUrl);
      await this.client.connect();
    } else if (!this.client.isConnected) {
      await this.client.connect();
    }

    await this.client.send('Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }],
    });

    this.unsubscribeFetchPaused = this.client.on(
      'Fetch.requestPaused',
      (params: Record<string, unknown>) => {
        this.handleRequestPaused(params as unknown as FetchRequestPausedParams);
      }
    );

    this._isAttached = true;
    globalEventBus.emit('cdp:stateChanged', { attached: true, port: this.debugPort });
  }

  private async handleRequestPaused(params: FetchRequestPausedParams): Promise<void> {
    const { requestId, request } = params;
    const { url, method, headers, postData } = request;

    const startTime = Date.now();
    const matchedRoute = this.routeTable.match(method, url);

    if (matchedRoute) {
      if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
        await new Promise((r) => setTimeout(r, matchedRoute.delayMs));
      }

      const bodyContent =
        typeof matchedRoute.body === 'string'
          ? matchedRoute.body
          : JSON.stringify(matchedRoute.body);

      const base64Body = Buffer.from(bodyContent, 'utf-8').toString('base64');

      const responseHeaders = [
        { name: 'Content-Type', value: 'application/json' },
        ...Object.entries(matchedRoute.headers || {}).map(([name, value]) => ({ name, value })),
      ];

      try {
        await this.client?.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: matchedRoute.statusCode,
          responseHeaders,
          body: base64Body,
        });

        const resHeaderMap: Record<string, string> = {};
        for (const h of responseHeaders) {
          resHeaderMap[h.name] = h.value;
        }

        const entry: TrafficEntry = {
          id: `cdp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: startTime,
          method,
          url,
          requestHeaders: sanitizeHeaders(headers),
          requestBody: postData,
          statusCode: matchedRoute.statusCode,
          responseHeaders: sanitizeHeaders(resHeaderMap),
          responseBody: bodyContent,
          durationMs: Date.now() - startTime,
          isMocked: true,
          matchedRouteId: matchedRoute.id,
        };

        this.trafficLedger.push(entry);
        globalEventBus.emit('traffic:logged', { entry });
      } catch (err) {
        console.error('Failed to fulfill CDP intercepted request:', err);
      }
    } else {
      try {
        await this.client?.send('Fetch.continueRequest', { requestId });
      } catch (err) {
        console.error('Failed to continue CDP request:', err);
      }
    }
  }

  private discoverWebSocketDebuggerUrl(debugPort: number): Promise<string> {
    assertLoopbackHost('127.0.0.1');

    return new Promise((resolve, reject) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: debugPort,
          path: '/json/version',
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`Failed to query Chrome debug port: HTTP ${res.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => {
            try {
              const info = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as ChromeVersionInfo;
              if (!info.webSocketDebuggerUrl) {
                reject(new Error('webSocketDebuggerUrl missing from Chrome /json/version response.'));
                return;
              }
              resolve(info.webSocketDebuggerUrl);
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(
          new Error(
            `Unable to connect to Chrome debugging port ${debugPort} on 127.0.0.1: ${err.message}`
          )
        );
      });
    });
  }

  public async detach(): Promise<void> {
    if (!this._isAttached) return;

    if (this.unsubscribeFetchPaused) {
      this.unsubscribeFetchPaused();
      this.unsubscribeFetchPaused = null;
    }

    if (this.client) {
      try {
        await this.client.send('Fetch.disable');
      } catch {
      }
      this.client.close();
      this.client = null;
    }

    this._isAttached = false;
    globalEventBus.emit('cdp:stateChanged', { attached: false, port: this.debugPort });
  }
}

export async function attachBrowser(
  debugPort: number = 9222,
  routeTable?: RouteTable
): Promise<CdpController> {
  const controller = new CdpBridgeController(debugPort, routeTable);
  await controller.attach();
  return controller;
}
