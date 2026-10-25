export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ApiClientType =
  | 'fetch'
  | 'axios'
  | 'useQuery'
  | 'angular-http'
  | 'ky'
  | 'superagent'
  | 'got'
  | 'ofetch'
  | 'swr'
  | 'rtk-query'
  | 'three-loader'
  | 'xhr'
  | 'openapi'
  | 'custom';

export interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type NetworkRoutingPolicy = 'isolated' | 'passthrough';

export interface DetectedApiCall {
  id: string;
  method: HttpMethod;
  url: string;
  clientType: ApiClientType;
  typeArgument?: string | undefined;
  inferredShape?: string | undefined;
  responseConstraints?: Record<string, Array<string | number | boolean>> | undefined;
  range: SourceRange;
  rawExpression: string;
  fileName?: string | undefined;
}

export interface GeneratedMock {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
  schemaDescription?: string | undefined;
}

export interface MockRoute {
  id: string;
  method: HttpMethod | '*';
  urlPattern: string;
  statusCode: number;
  headers?: Record<string, string> | undefined;
  body: unknown;
  delayMs?: number | undefined;
  enabled: boolean;
  createdAt: number;
  source: 'manual' | 'synthesizer' | 'recorded';
  scenario?: string | undefined;
  variants?: Record<string, GeneratedMock> | undefined;
}

export interface TrafficEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string | undefined;
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody?: string | undefined;
  durationMs: number;
  isMocked: boolean;
  matchedRouteId?: string | undefined;
}
