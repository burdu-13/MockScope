export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ApiClientType = 'fetch' | 'axios' | 'useQuery' | 'angular-http';

export interface SourcePosition {
  line: number;
  character: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export interface DetectedApiCall {
  id: string;
  method: HttpMethod;
  url: string;
  clientType: ApiClientType;
  typeArgument?: string | undefined;
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
