import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import { RouteTable, RuntimeProxy } from '../index';
import type { MockRoute } from '../../../shared/kernel/index';

describe('RouteTable', () => {
  it('should match exact and wildcard patterns', () => {
    const table = new RouteTable();
    const route1: MockRoute = {
      id: 'r1',
      method: 'GET',
      urlPattern: '/api/v1/users',
      statusCode: 200,
      body: [{ id: '1' }],
      enabled: true,
      createdAt: Date.now(),
      source: 'manual',
    };
    const route2: MockRoute = {
      id: 'r2',
      method: '*',
      urlPattern: '/api/v1/items/:id',
      statusCode: 200,
      body: { item: 'found' },
      enabled: true,
      createdAt: Date.now(),
      source: 'manual',
    };

    table.set(route1);
    table.set(route2);

    expect(table.match('GET', '/api/v1/users')?.id).toBe('r1');
    expect(table.match('POST', '/api/v1/users')).toBeUndefined();
    expect(table.match('GET', '/api/v1/items/42')?.id).toBe('r2');
    expect(table.match('DELETE', '/api/v1/items/abc-123')?.id).toBe('r2');
    expect(table.get('r1')?.id).toBe('r1');
    expect(table.getAll().length).toBe(2);

    table.delete('r1');
    expect(table.get('r1')).toBeUndefined();
    table.clear();
    expect(table.getAll().length).toBe(0);
  });

  it('should skip disabled routes', () => {
    const table = new RouteTable();
    table.set({
      id: 'r3',
      method: 'GET',
      urlPattern: '/test',
      statusCode: 200,
      body: 'ok',
      enabled: false,
      createdAt: Date.now(),
      source: 'manual',
    });

    expect(table.match('GET', '/test')).toBeUndefined();
  });
});

describe('RuntimeProxy Integration', () => {
  let proxy: RuntimeProxy | null = null;

  afterEach(async () => {
    if (proxy) {
      await proxy.dispose();
      proxy = null;
    }
  });

  function makeRequest(
    port: number,
    path: string,
    method: string = 'GET',
    headers: Record<string, string> = {},
    body?: string
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path,
          method,
          headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(Buffer.from(c)));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf-8'),
            });
          });
        }
      );
      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  it('should start on loopback, serve mock responses, and redact sensitive headers', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    const port = proxy.port;
    expect(port).toBeGreaterThan(0);
    expect(proxy.isRunning).toBe(true);

    const res404 = await makeRequest(port, '/unmatched');
    expect(res404.statusCode).toBe(404);

    proxy.addRoute({
      id: 'mock_profile',
      method: 'GET',
      urlPattern: '/api/profile',
      statusCode: 200,
      body: { username: 'alex', role: 'admin' },
      delayMs: 10,
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    expect(proxy.getRoutes().length).toBe(1);

    const res200 = await makeRequest(
      port,
      '/api/profile',
      'GET',
      {
        'Authorization': 'Bearer super-secret-key-99',
        'Accept': 'application/json',
      }
    );

    expect(res200.statusCode).toBe(200);
    const parsed = JSON.parse(res200.body);
    expect(parsed.username).toBe('alex');

    proxy.addRoute({
      id: 'mock_post',
      method: 'POST',
      urlPattern: '/api/items',
      statusCode: 201,
      body: { success: true },
      enabled: true,
      createdAt: Date.now(),
      source: 'manual',
    });

    const resPost = await makeRequest(
      port,
      '/api/items',
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ name: 'gadget' })
    );
    expect(resPost.statusCode).toBe(201);

    const traffic = proxy.getTraffic();
    expect(traffic.length).toBe(3);

    const profileTraffic = traffic.find((t) => t.url === '/api/profile');
    expect(profileTraffic).toBeDefined();
    expect(profileTraffic!.isMocked).toBe(true);
    expect(profileTraffic!.requestHeaders['authorization']).toBe('[REDACTED]');
    expect(profileTraffic!.requestHeaders['accept']).toBe('application/json');

    proxy.removeRoute('mock_profile');
    expect(proxy.getRoutes().length).toBe(1);

    proxy.clearTraffic();
    expect(proxy.getTraffic().length).toBe(0);
  });

  it('should handle CORS OPTIONS preflight', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    const res = await makeRequest(proxy.port, '/api/profile', 'OPTIONS');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
