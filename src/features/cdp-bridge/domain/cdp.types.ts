import type { MockRoute, TrafficEntry } from '../../../shared/kernel/index';

export interface InstalledBrowserInfo {
  name: string;
  path: string;
}

export interface BrowserLaunchOptions {
  port?: number | undefined;
  url?: string | undefined;
  userDataDir?: string | undefined;
  customBrowserPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface BrowserLaunchResult {
  browserName: string;
  executablePath: string;
  port: number;
  userDataDir: string;
}

export interface CdpAttachOptions {
  autoLaunch?: boolean | undefined;
  targetUrl?: string | undefined;
  customBrowserPath?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface CdpController {
  readonly debugPort: number;
  readonly isAttached: boolean;
  attach(options?: CdpAttachOptions): Promise<void>;
  addRoute(route: MockRoute): void;
  removeRoute(routeId: string): void;
  getRoutes(): MockRoute[];
  getTraffic(): TrafficEntry[];
  clearTraffic(): void;
  detach(): Promise<void>;
}

export interface ChromeVersionInfo {
  Browser?: string;
  'Protocol-Version'?: string;
  'User-Agent'?: string;
  'V8-Version'?: string;
  'WebKit-Version'?: string;
  webSocketDebuggerUrl?: string;
}

export interface FetchRequestPausedParams {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
    hasPostData?: boolean;
  };
  frameId: string;
  resourceType: string;
  responseStatusCode?: number;
  responseHeaders?: Array<{ name: string; value: string }>;
}
