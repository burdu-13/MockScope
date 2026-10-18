import { WebSocket } from 'ws';
import { assertLoopbackHost } from '../kernel/index';

export interface CdpResponse {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export type CdpEventHandler = (params: Record<string, unknown>) => void;

export class CdpClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pendingCallbacks = new Map<number, (res: CdpResponse) => void>();
  private eventHandlers = new Map<string, Set<CdpEventHandler>>();
  private _isConnected: boolean = false;

  constructor(private readonly wsUrl: string) {
    const parsed = new URL(wsUrl);
    assertLoopbackHost(parsed.hostname);
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this._isConnected = true;
        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const message: CdpResponse = JSON.parse(data.toString());
          if (message.id && this.pendingCallbacks.has(message.id)) {
            const cb = this.pendingCallbacks.get(message.id)!;
            this.pendingCallbacks.delete(message.id);
            cb(message);
          } else if (message.method) {
            const handlers = this.eventHandlers.get(message.method);
            if (handlers) {
              for (const handler of handlers) {
                handler(message.params || {});
              }
            }
          }
        } catch (err) {
          console.error('Error handling CDP message:', err);
        }
      });

      this.ws.on('error', (err) => {
        if (!this._isConnected) {
          reject(err);
        }
      });

      this.ws.on('close', () => {
        this._isConnected = false;
        this.pendingCallbacks.clear();
      });
    });
  }

  public send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    if (!this.ws || !this._isConnected) {
      return Promise.reject(new Error('CDP client is not connected.'));
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(id, (res) => {
        if (res.error) {
          reject(new Error(`CDP Error [${res.error.code}]: ${res.error.message}`));
        } else {
          resolve(res.result);
        }
      });

      this.ws!.send(payload, (err) => {
        if (err) {
          this.pendingCallbacks.delete(id);
          reject(err);
        }
      });
    });
  }

  public on(event: string, handler: CdpEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    const handlers = this.eventHandlers.get(event)!;
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
    };
  }

  public close(): void {
    this._isConnected = false;
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    this.pendingCallbacks.clear();
    this.eventHandlers.clear();
  }
}
