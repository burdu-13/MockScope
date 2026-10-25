import * as http from 'node:http';
import { CdpClient } from '../../../shared/cdp/index';
import {
  CircularRingBuffer,
  sanitizeHeaders,
  assertLoopbackHost,
  type MockRoute,
  type TrafficEntry,
  globalEventBus,
  generateCompanionAuthResponse,
  generateMockJwt,
} from '../../../shared/kernel/index';
import { RouteTable } from '../../runtime-proxy/index';
import type {
  CdpController,
  CdpAttachOptions,
  ChromeVersionInfo,
  FetchRequestPausedParams,
} from '../domain/cdp.types';
import { launchBrowserWithDebugging } from './browser-launcher';

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

  public async attach(options?: CdpAttachOptions): Promise<void> {
    if (this._isAttached) return;

    if (!this.client) {
      let wsUrl: string;
      try {
        wsUrl = await this.discoverWebSocketDebuggerUrl(this.debugPort);
      } catch (err: unknown) {
        if (options?.autoLaunch === true) {
          await launchBrowserWithDebugging({
            port: this.debugPort,
            url: options?.targetUrl,
            customBrowserPath: options?.customBrowserPath,
            timeoutMs: options?.timeoutMs,
          });
          wsUrl = await this.discoverWebSocketDebuggerUrl(this.debugPort);
        } else {
          throw err;
        }
      }

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

    let fulfillBody: string | null = null;
    let fulfillStatusCode = 200;
    let customHeaders: Record<string, string> = {};

    if (matchedRoute) {
      if (matchedRoute.delayMs && matchedRoute.delayMs > 0) {
        await new Promise((r) => setTimeout(r, matchedRoute.delayMs));
      }
      fulfillStatusCode = matchedRoute.statusCode;
      customHeaders = matchedRoute.headers || {};
      fulfillBody =
        typeof matchedRoute.body === 'string'
          ? matchedRoute.body
          : JSON.stringify(matchedRoute.body, null, 2);
    } else if (is2faEndpoint) {
      let code = '';
      let parsed: Record<string, unknown> = {};
      try {
        if (postData) {
          parsed = JSON.parse(postData);
          code = String(parsed.code || parsed.otp || parsed.totp || parsed.token || '').trim();
        }
      } catch {}

      if (code === '000000') {
        fulfillStatusCode = 401;
        fulfillBody = JSON.stringify(
          {
            error: 'InvalidVerificationCode',
            message: 'The verification code provided is incorrect or has expired.',
            code: 'MFA_CODE_INVALID',
          },
          null,
          2
        );
      } else {
        const userName = String(parsed['name'] || parsed['username'] || 'Dev User');
        const userEmail = String(parsed['email'] || 'dev@example.com');
        const userId = String(parsed['id'] || parsed['userId'] || 'usr_dev_1');

        const jwt = generateMockJwt({
          mfa_verified: true,
          twoFactorVerified: true,
          sub: userId,
          id: userId,
          userId,
          name: userName,
          email: userEmail,
          username: String(parsed['username'] || 'devuser'),
        });
        const base = {
          authenticated: true,
          success: true,
          status: 'success',
          accessToken: jwt,
          token: jwt,
          jwt,
          access_token: jwt,
          refreshToken: 'rt_refresh_token_dev_1',
          tokenType: 'Bearer',
          token_type: 'Bearer',
          expiresIn: 86400,
          user: {
            id: userId,
            userId,
            email: userEmail,
            name: userName,
            role: 'admin',
            roles: ['user', 'developer', 'admin'],
            twoFactorVerified: true,
          },
        };
        fulfillStatusCode = 200;
        customHeaders = { 'Set-Cookie': 'mockscope_auth=authenticated; Path=/; SameSite=Lax' };
        fulfillBody = JSON.stringify(
          {
            data: base,
            result: base,
            payload: base,
            ...base,
          },
          null,
          2
        );
      }
    } else if (isAuthProfileEndpoint) {
      fulfillStatusCode = 200;
      customHeaders = { 'Set-Cookie': 'mockscope_session=active; Path=/; SameSite=Lax' };
      fulfillBody = JSON.stringify(generateCompanionAuthResponse('profile'), null, 2);
    } else if (isTokenRefreshEndpoint) {
      fulfillStatusCode = 200;
      customHeaders = { 'Set-Cookie': 'mockscope_session=active; Path=/; SameSite=Lax' };
      fulfillBody = JSON.stringify(generateCompanionAuthResponse('refresh'), null, 2);
    }

    if (fulfillBody !== null) {
      const base64Body = Buffer.from(fulfillBody, 'utf-8').toString('base64');
      const responseHeaders = [
        { name: 'Content-Type', value: 'application/json' },
        ...Object.entries(customHeaders).map(([name, value]) => ({ name, value })),
      ];

      try {
        await this.client?.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: fulfillStatusCode,
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
          statusCode: fulfillStatusCode,
          responseHeaders: sanitizeHeaders(resHeaderMap),
          responseBody: fulfillBody,
          durationMs: Date.now() - startTime,
          isMocked: true,
          matchedRouteId: matchedRoute?.id,
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
  routeTable?: RouteTable,
  options?: CdpAttachOptions
): Promise<CdpController> {
  const controller = new CdpBridgeController(debugPort, routeTable);
  await controller.attach(options);
  return controller;
}
