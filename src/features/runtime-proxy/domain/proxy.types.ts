import type { MockRoute, TrafficEntry } from '../../../shared/kernel/index';

export type JitRouteResolver = (
  method: string,
  url: string,
  requestBody?: string
) => MockRoute | undefined;

export interface ProxyController {
  readonly port: number;
  readonly isRunning: boolean;
  addRoute(route: MockRoute): void;
  removeRoute(routeId: string): void;
  getRoutes(): MockRoute[];
  findRoute(method: string, urlPattern: string): MockRoute | undefined;
  setJitRouteResolver?(resolver: JitRouteResolver): void;
  getTraffic(): TrafficEntry[];
  clearTraffic(): void;
  dispose(): Promise<void>;
}
