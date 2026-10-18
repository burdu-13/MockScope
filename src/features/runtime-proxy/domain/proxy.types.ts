import type { MockRoute, TrafficEntry } from '../../../shared/kernel/index';

export interface ProxyController {
  readonly port: number;
  readonly isRunning: boolean;
  addRoute(route: MockRoute): void;
  removeRoute(routeId: string): void;
  getRoutes(): MockRoute[];
  getTraffic(): TrafficEntry[];
  clearTraffic(): void;
  dispose(): Promise<void>;
}
