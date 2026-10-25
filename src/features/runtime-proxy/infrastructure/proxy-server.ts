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
  detectImageType,
  generatePlaceholderSvg,
  generateMockJwt,
  generateCompanionAuthResponse,
} from '../../../shared/kernel/index';
import { RouteTable } from './route-table';
import type { ProxyController, JitRouteResolver } from '../domain/proxy.types';

export const DEFAULT_PROXY_PORT = 45990;

const PROTECTED_RESPONSE_KEYS = new Set([
  'id',
  'status',
  'verify',
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'token',
  'jwt',
  'challengeId',
  'verification_token',
  'method',
  'reason',
  'success',
  'isSuccess',
  'data',
  'result',
  'payload',
]);

export class RuntimeProxy implements ProxyController {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly routeTable = new RouteTable();
  private readonly trafficLedger = new CircularRingBuffer<TrafficEntry>(100);
  private readonly activeSockets = new Set<Socket>();
  private jitRouteResolver: JitRouteResolver | null = null;
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

  public setJitRouteResolver(resolver: JitRouteResolver): void {
    this.jitRouteResolver = resolver;
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

  public findRoute(method: string, urlPattern: string): MockRoute | undefined {
    return this.routeTable.findExact(method, urlPattern);
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
      this.wss.on('error', () => {
      });
      this.wss.on('connection', (ws: WebSocket) => {
        ws.send(
          JSON.stringify({
            type: 'stateUpdate',
            proxy: { running: true, port: this._port },
            cdp: { attached: false, port: 9222 },
            routes: this.getRoutes(),
            traffic: this.getTraffic(),
            discoveredCalls: [],
          })
        );

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'ready' || msg.type === 'getState') {
              ws.send(
                JSON.stringify({
                  type: 'stateUpdate',
                  proxy: { running: true, port: this._port },
                  cdp: { attached: false, port: 9222 },
                  routes: this.getRoutes(),
                  traffic: this.getTraffic(),
                  discoveredCalls: [],
                })
              );
            } else if (msg.type === 'toggleRoute' && msg.routeId) {
              const route = this.routeTable.get(msg.routeId);
              if (route) {
                route.enabled = !route.enabled;
                this.addRoute(route);
              }
            } else if (msg.type === 'clearTraffic') {
              this.clearTraffic();
            } else if (msg.type === 'saveRoute' && msg.route) {
              this.addRoute(msg.route);
            } else if (msg.type === 'deleteRoute' && msg.routeId) {
              this.removeRoute(msg.routeId);
            } else if (msg.type === 'switchRouteScenario' && msg.routeId && msg.scenario) {
              const route = this.routeTable.get(msg.routeId);
              if (route && route.variants && route.variants[msg.scenario]) {
                route.scenario = msg.scenario;
                route.statusCode = route.variants[msg.scenario].statusCode;
                route.headers = route.variants[msg.scenario].headers;
                route.body = route.variants[msg.scenario].body;
                this.addRoute(route);
              }
            }
          } catch {
          }
        });
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

    const origin = (req.headers.origin as string) || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      (req.headers['access-control-request-headers'] as string) || '*'
    );
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (method === 'OPTIONS') {
      res.setHeader('Content-Length', '0');
      res.writeHead(204);
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', async () => {
      const requestBody = Buffer.concat(chunks).toString('utf-8');
      const sanitizedReqHeaders = sanitizeHeaders(req.headers as Record<string, string>);

      let matchedRoute = this.routeTable.match(method, url);
      if (!matchedRoute && this.jitRouteResolver) {
        const jitRoute = this.jitRouteResolver(method, url, requestBody || undefined);
        if (jitRoute) {
          this.addRoute(jitRoute);
          matchedRoute = jitRoute;
        }
      }

      let statusCode = 404;
      let responseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      let responseBody: string = JSON.stringify({
        error: 'Not Found',
        message: `MockScope Proxy: No mock route configured for ${method} ${url}`,
      });

      const lowerUrl = url.toLowerCase();
      const isImageRequest =
        lowerUrl.endsWith('.jpg') ||
        lowerUrl.endsWith('.jpeg') ||
        lowerUrl.endsWith('.png') ||
        lowerUrl.endsWith('.svg') ||
        lowerUrl.endsWith('.webp') ||
        lowerUrl.includes('poster') ||
        lowerUrl.includes('avatar') ||
        lowerUrl.includes('backdrop') ||
        lowerUrl.includes('placeholder');

      const is2faEndpoint =
        method === 'POST' &&
        (lowerUrl.includes('/2fa') ||
          lowerUrl.includes('/mfa') ||
          lowerUrl.includes('/otp') ||
          lowerUrl.includes('/verify') ||
          lowerUrl.includes('/totp'));

      const isAuthProfileEndpoint =
        !isImageRequest &&
        (lowerUrl.includes('/me') ||
          lowerUrl.includes('/profile') ||
          lowerUrl.includes('/current-user') ||
          lowerUrl.includes('/currentuser') ||
          lowerUrl.includes('/account') ||
          lowerUrl.includes('/session') ||
          lowerUrl.includes('/permissions') ||
          lowerUrl.includes('/roles') ||
          lowerUrl.endsWith('/user') ||
          lowerUrl.includes('/user/') ||
          lowerUrl.includes('/users/'));

      const isTokenRefreshEndpoint =
        method === 'POST' &&
        (lowerUrl.includes('/refresh') ||
          (lowerUrl.includes('/token') && !lowerUrl.includes('/login')));

      if (matchedRoute) {
        if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
          await new Promise((r) => setTimeout(r, matchedRoute.delayMs));
        }

        if (
          matchedRoute.scenario &&
          matchedRoute.scenario !== 'ok200' &&
          matchedRoute.scenario !== 'loading200' &&
          matchedRoute.variants &&
          matchedRoute.variants[matchedRoute.scenario]
        ) {
          const activeVariant = matchedRoute.variants[matchedRoute.scenario];
          statusCode = activeVariant.statusCode;
          responseHeaders = {
            'Content-Type': 'application/json',
            ...(activeVariant.headers || {}),
          };
          responseBody = activeVariant.rawBody;
        } else {
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

        if (statusCode >= 200 && statusCode < 300) {
          responseBody = this.applyDynamicUrlAndQueryContext(
            method,
            url,
            matchedRoute,
            responseBody
          );
        }

        if (
          statusCode >= 200 &&
          statusCode < 300 &&
          requestBody &&
          (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')
        ) {
          responseBody = this.applyStatefulRequestMutation(
            method,
            url,
            matchedRoute,
            requestBody,
            responseBody
          );
        }
      } else if (is2faEndpoint) {
        let parsedBody: Record<string, unknown> = {};
        try {
          parsedBody = JSON.parse(requestBody);
        } catch {
        }

        const code = String(
          parsedBody['code'] ||
            parsedBody['otp'] ||
            parsedBody['totp'] ||
            parsedBody['token'] ||
            req.headers['x-mfa-code'] ||
            req.headers['x-otp-code'] ||
            ''
        ).trim();

        if (code === '000000') {
          statusCode = 401;
          responseHeaders = { 'Content-Type': 'application/json' };
          responseBody = JSON.stringify(
            {
              error: 'InvalidVerificationCode',
              message:
                'The verification code provided is incorrect or has expired.',
              code: 'MFA_CODE_INVALID',
              attemptsRemaining: 2,
            },
            null,
            2
          );
        } else {
          const userName = String(parsedBody['name'] || parsedBody['username'] || 'Dev User');
          const userEmail = String(parsedBody['email'] || 'dev@example.com');
          const userId = String(parsedBody['id'] || parsedBody['userId'] || 'usr_dev_1');

          const jwt = generateMockJwt({
            mfa_verified: true,
            twoFactorVerified: true,
            sub: userId,
            id: userId,
            userId,
            name: userName,
            email: userEmail,
            username: String(parsedBody['username'] || 'devuser'),
          });
          statusCode = 200;
          responseHeaders = {
            'Content-Type': 'application/json',
            'Set-Cookie': 'mockscope_auth=authenticated; Path=/; SameSite=Lax',
          };
          responseBody = JSON.stringify(
            {
              authenticated: true,
              success: true,
              status: 'success',
              message: 'Verification successful',
              accessToken: jwt,
              token: jwt,
              jwt,
              access_token: jwt,
              refreshToken: 'rt_refresh_token_dev_1',
              refresh_token: 'rt_refresh_token_dev_1',
              tokenType: 'Bearer',
              token_type: 'Bearer',
              expiresIn: 86400,
              expires_in: 86400,
              user: {
                id: userId,
                userId,
                email: userEmail,
                name: userName,
                role: 'admin',
                roles: ['user', 'developer', 'admin'],
                twoFactorVerified: true,
                mfaVerified: true,
              },
            },
            null,
            2
          );
        }
      } else if (isAuthProfileEndpoint) {
        statusCode = 200;
        responseHeaders = {
          'Content-Type': 'application/json',
          'Set-Cookie': 'mockscope_session=active; Path=/; SameSite=Lax',
        };
        const companionData = generateCompanionAuthResponse('profile');
        responseBody = JSON.stringify(companionData, null, 2);
      } else if (isTokenRefreshEndpoint) {
        statusCode = 200;
        responseHeaders = {
          'Content-Type': 'application/json',
          'Set-Cookie': 'mockscope_session=active; Path=/; SameSite=Lax',
        };
        const companionData = generateCompanionAuthResponse('refresh');
        responseBody = JSON.stringify(companionData, null, 2);
      } else if (isImageRequest) {
        statusCode = 200;
        responseHeaders = { 'Content-Type': 'image/svg+xml; charset=utf-8' };
        responseBody = generatePlaceholderSvg(detectImageType(url));
      }

      const durationMs = Date.now() - startTime;
      const sanitizedResHeaders = sanitizeHeaders(responseHeaders);
      const isAutoMocked =
        Boolean(matchedRoute) ||
        is2faEndpoint ||
        isAuthProfileEndpoint ||
        isTokenRefreshEndpoint ||
        isImageRequest;

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
        isMocked: isAutoMocked,
        matchedRouteId: matchedRoute?.id,
      };

      this.trafficLedger.push(trafficEntry);
      globalEventBus.emit('traffic:logged', { entry: trafficEntry });
      this.broadcastWs({ type: 'traffic:entry', entry: trafficEntry });

      for (const [key, value] of Object.entries(responseHeaders)) {
        res.setHeader(key, value);
      }
      res.setHeader('Content-Length', Buffer.byteLength(responseBody, 'utf-8'));
      res.writeHead(statusCode);
      res.end(responseBody);
    });
  }

  private extractPathParamValue(url: string, urlPattern: string): string | undefined {
    const cleanUrl = (url.split('?')[0] || '/').replace(/\/+$/, '');
    const cleanPattern = (urlPattern.split('?')[0] || '/')
      .replace(/\{([a-zA-Z0-9_]+)\}/g, ':$1')
      .replace(/\/+$/, '');
    const urlParts = cleanUrl.split('/').filter(Boolean);
    const patternParts = cleanPattern.split('/').filter(Boolean);

    if (urlParts.length === patternParts.length) {
      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i]!.startsWith(':')) {
          return decodeURIComponent(urlParts[i]!);
        }
      }
    }
    const lastSeg = urlParts[urlParts.length - 1];
    if (lastSeg && (lastSeg.startsWith('id_') || /^\d+$/.test(lastSeg))) {
      return decodeURIComponent(lastSeg);
    }
    return undefined;
  }

  private syncMutatedRoute(route: MockRoute): void {
    if (route.variants?.['ok200']) {
      route.variants['ok200'].body = route.body;
      route.variants['ok200'].rawBody =
        typeof route.body === 'string' ? route.body : JSON.stringify(route.body, null, 2);
    }
    globalEventBus.emit('route:upserted', { route });
  }

  private applyDynamicUrlAndQueryContext(
    method: string,
    url: string,
    matchedRoute: MockRoute,
    responseBody: string
  ): string {
    try {
      const cleanPath = url.split('?')[0] || '/';
      const prefixMatch = cleanPath.match(/^(\/[a-zA-Z0-9_-]+)/);
      const resourcePrefix = prefixMatch?.[1]?.toLowerCase();
      const extractedId = this.extractPathParamValue(url, matchedRoute.urlPattern);

      if (method === 'DELETE' && extractedId && resourcePrefix) {
        for (const route of this.routeTable.getAll()) {
          if (route.method === 'GET' && route.urlPattern.toLowerCase().startsWith(resourcePrefix) && Array.isArray(route.body)) {
            const list = route.body as Array<Record<string, unknown>>;
            const idx = list.findIndex((item) => item && (item['id'] === extractedId || item['cardId'] === extractedId));
            if (idx !== -1) {
              list.splice(idx, 1);
              this.syncMutatedRoute(route);
            }
          }
        }
      }

      if (extractedId && matchedRoute.urlPattern.includes(':')) {
        const parsedRes = JSON.parse(responseBody);
        if (parsedRes && typeof parsedRes === 'object' && !Array.isArray(parsedRes)) {
          const resObj = parsedRes as Record<string, unknown>;
          let mutated = false;

          if (resourcePrefix) {
            for (const route of this.routeTable.getAll()) {
              if (route.method === 'GET' && route.urlPattern.toLowerCase().startsWith(resourcePrefix) && Array.isArray(route.body)) {
                const list = route.body as Array<Record<string, unknown>>;
                const matchedItem = list.find(
                  (item) => item && (item['id'] === extractedId || item['cardId'] === extractedId)
                );
                if (matchedItem) {
                  for (const [k, v] of Object.entries(matchedItem)) {
                    if (k in resObj && v !== undefined && v !== null) {
                      resObj[k] = v;
                      if (resObj['data'] && typeof resObj['data'] === 'object' && !Array.isArray(resObj['data'])) {
                        (resObj['data'] as Record<string, unknown>)[k] = v;
                      }
                      mutated = true;
                    }
                  }
                  break;
                }
              }
            }
          }

          if ('id' in resObj && resObj['id'] !== extractedId) {
            resObj['id'] = extractedId;
            if (resObj['data'] && typeof resObj['data'] === 'object' && !Array.isArray(resObj['data'])) {
              (resObj['data'] as Record<string, unknown>)['id'] = extractedId;
            }
            mutated = true;
          }
          if ('cardId' in resObj && resObj['cardId'] !== extractedId) {
            resObj['cardId'] = extractedId;
            mutated = true;
          }

          if (mutated) {
            responseBody = JSON.stringify(resObj, null, 2);
          }
        }
      }

      if (method === 'GET' && url.includes('?')) {
        const queryStr = url.split('?')[1] || '';
        const params = new URLSearchParams(queryStr);
        const filterKeys = ['status', 'currency', 'accountId', 'categoryId', 'transactionType', 'type'];
        const activeFilters: Array<[string, string]> = [];
        for (const fk of filterKeys) {
          const val = params.get(fk);
          if (val !== null && val !== '' && val !== 'all' && val !== 'null' && val !== 'undefined') {
            activeFilters.push([fk, val]);
          }
        }
        const limitParam = params.get('limit') || params.get('pageSize');
        const limit = limitParam ? parseInt(limitParam, 10) : NaN;

        if (activeFilters.length > 0 || !isNaN(limit)) {
          const parsedRes = JSON.parse(responseBody);
          const filterList = (list: unknown[]): unknown[] => {
            let filtered = list;
            for (const [fk, fval] of activeFilters) {
              const subset = filtered.filter((item) => {
                if (!item || typeof item !== 'object') return true;
                const rec = item as Record<string, unknown>;
                if (!(fk in rec)) return true;
                return String(rec[fk]).toLowerCase() === fval.toLowerCase();
              });
              if (subset.length > 0) {
                filtered = subset;
              }
            }
            if (!isNaN(limit) && limit > 0 && filtered.length > limit) {
              filtered = filtered.slice(0, limit);
            }
            return filtered;
          };

          if (Array.isArray(parsedRes)) {
            return JSON.stringify(filterList(parsedRes), null, 2);
          }
          if (parsedRes && typeof parsedRes === 'object') {
            const obj = parsedRes as Record<string, unknown>;
            if (Array.isArray(obj['items'])) {
              obj['items'] = filterList(obj['items']);
              if (obj['data'] && typeof obj['data'] === 'object' && Array.isArray((obj['data'] as any)['items'])) {
                (obj['data'] as any)['items'] = obj['items'];
              }
              return JSON.stringify(obj, null, 2);
            }
          }
        }
      }
    } catch {
    }
    return responseBody;
  }

  private applyStatefulRequestMutation(
    method: string,
    url: string,
    matchedRoute: MockRoute,
    requestBody: string,
    responseBody: string
  ): string {
    try {
      const parsedReq = JSON.parse(requestBody);
      if (!parsedReq || typeof parsedReq !== 'object') {
        return responseBody;
      }

      const cleanPath = url.split('?')[0] || '/';
      const prefixMatch = cleanPath.match(/^(\/[a-zA-Z0-9_-]+)/);
      const resourcePrefix = prefixMatch?.[1]?.toLowerCase();
      const urlParamId = this.extractPathParamValue(url, matchedRoute.urlPattern);

      if (Array.isArray(parsedReq) && resourcePrefix) {
        for (const route of this.routeTable.getAll()) {
          if (route.method === 'GET' && route.urlPattern.toLowerCase().startsWith(resourcePrefix) && Array.isArray(route.body)) {
            const list = route.body as Array<Record<string, unknown>>;
            for (const patchItem of parsedReq) {
              if (patchItem && typeof patchItem === 'object' && 'id' in patchItem) {
                const target = list.find((item) => item && item['id'] === patchItem.id);
                if (target) {
                  for (const [k, v] of Object.entries(patchItem)) {
                    if (!PROTECTED_RESPONSE_KEYS.has(k)) {
                      target[k] = v;
                    }
                  }
                }
              }
            }
            this.syncMutatedRoute(route);
          }
        }
        return responseBody;
      }

      if (!Array.isArray(parsedReq)) {
        const reqObj = parsedReq as Record<string, unknown>;
        const targetId =
          reqObj['id'] ||
          reqObj['accountId'] ||
          reqObj['cardId'] ||
          reqObj['loanId'] ||
          urlParamId;

        if (resourcePrefix) {
          for (const route of this.routeTable.getAll()) {
            if (route.method === 'GET' && route.urlPattern.toLowerCase().startsWith(resourcePrefix) && Array.isArray(route.body)) {
              const list = route.body as Array<Record<string, unknown>>;
              const isCreateAction =
                method === 'POST' &&
                (cleanPath.includes('create') || cleanPath.includes('request') || cleanPath === route.urlPattern);

              if (isCreateAction && list.length > 0 && list[0] && typeof list[0] === 'object') {
                const template = { ...(list[0] as Record<string, unknown>) };
                template['id'] = `id_${1001 + list.length}`;
                for (const [k, v] of Object.entries(reqObj)) {
                  if (!PROTECTED_RESPONSE_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
                    template[k] = v;
                  }
                }
                list.unshift(template);
                this.syncMutatedRoute(route);
              } else {
                const target = targetId
                  ? list.find((item) => item && (item['id'] === targetId || item['cardId'] === targetId)) ?? list[0]
                  : list[0];
                if (target) {
                  for (const [k, v] of Object.entries(reqObj)) {
                    if (!PROTECTED_RESPONSE_KEYS.has(k) && k in target) {
                      target[k] = v;
                    }
                  }
                  this.syncMutatedRoute(route);
                }
              }
            }
          }
        }

        const parsedRes = JSON.parse(responseBody);
        if (parsedRes && typeof parsedRes === 'object' && !Array.isArray(parsedRes)) {
          const resObj = parsedRes as Record<string, unknown>;
          let mutated = false;
          if (urlParamId && 'id' in resObj) {
            resObj['id'] = urlParamId;
            mutated = true;
          }
          for (const [k, v] of Object.entries(reqObj)) {
            if (
              !PROTECTED_RESPONSE_KEYS.has(k) &&
              (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
              k in resObj
            ) {
              resObj[k] = v;
              if (resObj['data'] && typeof resObj['data'] === 'object' && !Array.isArray(resObj['data'])) {
                (resObj['data'] as Record<string, unknown>)[k] = v;
              }
              if (resObj['result'] && typeof resObj['result'] === 'object' && !Array.isArray(resObj['result'])) {
                (resObj['result'] as Record<string, unknown>)[k] = v;
              }
              if (resObj['payload'] && typeof resObj['payload'] === 'object' && !Array.isArray(resObj['payload'])) {
                (resObj['payload'] as Record<string, unknown>)[k] = v;
              }
              mutated = true;
            }
          }
          if (mutated) {
            return JSON.stringify(resObj, null, 2);
          }
        }
      }
    } catch {
    }
    return responseBody;
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
