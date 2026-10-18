import type { MockRoute, TrafficEntry } from '../../../shared/kernel/index';

export interface CdpController {
  readonly debugPort: number;
  readonly isAttached: boolean;
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
