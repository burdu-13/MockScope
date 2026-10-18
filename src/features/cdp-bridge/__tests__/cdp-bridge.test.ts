import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { CdpClient } from '../../../shared/cdp/index';
import { CdpBridgeController } from '../index';
import { RouteTable } from '../../runtime-proxy/index';
import type { MockRoute } from '../../../shared/kernel/index';

describe('cdp-bridge and CdpClient', () => {
  let wss: WebSocketServer | null = null;
  let serverPort: number = 0;

  function createMockCdpServer(): Promise<number> {
    return new Promise((resolve) => {
      wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => {
        const addr = wss!.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(serverPort);
      });
    });
  }

  afterEach(() => {
    if (wss) {
      wss.close();
      wss = null;
    }
  });

  it('should reject non-loopback hosts', () => {
    expect(() => new CdpClient('ws://192.168.1.100:9222/devtools/browser')).toThrow();
    expect(() => new CdpClient('ws://0.0.0.0:9222/devtools/browser')).toThrow();
  });

  it('should fail send() if not connected', async () => {
    const port = await createMockCdpServer();
    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page`);
    await expect(client.send('Fetch.enable')).rejects.toThrow('CDP client is not connected');
  });

  it('should handle CDP errors sent from browser', async () => {
    const port = await createMockCdpServer();
    wss!.on('connection', (ws: WebSocket) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        ws.send(JSON.stringify({ id: msg.id, error: { code: -32601, message: 'Method not found' } }));
      });
    });

    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page`);
    await client.connect();
    await expect(client.send('Invalid.method')).rejects.toThrow('CDP Error [-32601]: Method not found');
    client.close();
  });

  it('should exchange CDP commands, fulfill mocked requests, and continue unmocked requests', async () => {
    const port = await createMockCdpServer();
    const sentMessages: any[] = [];

    wss!.on('connection', (ws: WebSocket) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        sentMessages.push(msg);

        if (msg.method === 'Fetch.enable') {
          ws.send(JSON.stringify({ id: msg.id, result: {} }));

          setTimeout(() => {
            ws.send(
              JSON.stringify({
                method: 'Fetch.requestPaused',
                params: {
                  requestId: 'req_123',
                  request: {
                    url: 'http://127.0.0.1/api/data',
                    method: 'GET',
                    headers: { 'Authorization': 'secret' },
                  },
                  frameId: 'frame_1',
                  resourceType: 'XHR',
                },
              })
            );
          }, 10);

          setTimeout(() => {
            ws.send(
              JSON.stringify({
                method: 'Fetch.requestPaused',
                params: {
                  requestId: 'req_unmocked_456',
                  request: {
                    url: 'http://127.0.0.1/api/unmocked',
                    method: 'GET',
                    headers: {},
                  },
                  frameId: 'frame_1',
                  resourceType: 'XHR',
                },
              })
            );
          }, 25);
        } else if (msg.method === 'Fetch.fulfillRequest') {
          ws.send(JSON.stringify({ id: msg.id, result: {} }));
        } else if (msg.method === 'Fetch.continueRequest') {
          ws.send(JSON.stringify({ id: msg.id, result: {} }));
        } else if (msg.method === 'Fetch.disable') {
          ws.send(JSON.stringify({ id: msg.id, result: {} }));
        }
      });
    });

    const client = new CdpClient(`ws://127.0.0.1:${port}/devtools/page`);
    const routeTable = new RouteTable();
    const route: MockRoute = {
      id: 'mock_1',
      method: 'GET',
      urlPattern: '/api/data',
      statusCode: 200,
      body: { message: 'hello from CDP mock' },
      delayMs: 5,
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    };
    routeTable.set(route);

    const controller = new CdpBridgeController(port, routeTable, client);
    await controller.attach();
    expect(controller.isAttached).toBe(true);

    await new Promise((r) => setTimeout(r, 80));

    const fulfillCall = sentMessages.find((m) => m.method === 'Fetch.fulfillRequest');
    expect(fulfillCall).toBeDefined();
    expect(fulfillCall.params.requestId).toBe('req_123');
    expect(fulfillCall.params.responseCode).toBe(200);

    const continueCall = sentMessages.find((m) => m.method === 'Fetch.continueRequest');
    expect(continueCall).toBeDefined();
    expect(continueCall.params.requestId).toBe('req_unmocked_456');

    expect(controller.getRoutes().length).toBe(1);
    controller.removeRoute('mock_1');
    expect(controller.getRoutes().length).toBe(0);

    const traffic = controller.getTraffic();
    expect(traffic.length).toBe(1);
    controller.clearTraffic();
    expect(controller.getTraffic().length).toBe(0);

    await controller.detach();
    expect(controller.isAttached).toBe(false);
  });
});
