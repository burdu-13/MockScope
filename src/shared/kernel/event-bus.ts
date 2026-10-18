import type { DetectedApiCall, MockRoute, TrafficEntry } from './types';

export interface KernelEvents {
  'call:detected': { documentUri: string; calls: DetectedApiCall[] };
  'traffic:logged': { entry: TrafficEntry };
  'route:upserted': { route: MockRoute };
  'route:deleted': { routeId: string };
  'proxy:stateChanged': { running: boolean; port: number };
  'cdp:stateChanged': { attached: boolean; port: number };
}

export type EventCallback<T> = (payload: T) => void;

export class KernelEventBus {
  private listeners: Map<keyof KernelEvents, Set<EventCallback<unknown>>> = new Map();

  public on<K extends keyof KernelEvents>(event: K, callback: EventCallback<KernelEvents[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(callback as EventCallback<unknown>);

    return () => {
      handlers.delete(callback as EventCallback<unknown>);
    };
  }

  public emit<K extends keyof KernelEvents>(event: K, payload: KernelEvents[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in event listener for ${String(event)}:`, err);
        }
      }
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const globalEventBus = new KernelEventBus();
