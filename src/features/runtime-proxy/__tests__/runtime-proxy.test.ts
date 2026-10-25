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

  it('should match routes queried through proxy parameter like ?path=genre/movie/list', () => {
    const table = new RouteTable();
    table.set({
      id: 'genre_route',
      method: 'GET',
      urlPattern: '/genre/:type/list',
      statusCode: 200,
      body: { genres: ['Action', 'Comedy'] },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    expect(table.match('GET', '/genre/movie/list')?.id).toBe('genre_route');
    expect(table.match('GET', '/?path=genre/movie/list')?.id).toBe('genre_route');
    expect(table.match('GET', 'http://127.0.0.1:45990/?path=genre/movie/list')?.id).toBe('genre_route');
  });

  it('should deduplicate routes when set is called with the same method and urlPattern', () => {
    const table = new RouteTable();
    table.set({
      id: 'r_initial',
      method: 'POST',
      urlPattern: '/auth/login',
      statusCode: 200,
      body: { token: 'old' },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    expect(table.getAll().length).toBe(1);
    expect(table.findExact('POST', '/auth/login')?.id).toBe('r_initial');

    table.set({
      id: 'r_new',
      method: 'POST',
      urlPattern: '/auth/login',
      statusCode: 200,
      body: { token: 'new' },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    expect(table.getAll().length).toBe(1);
    expect(table.findExact('POST', '/auth/login')?.id).toBe('r_new');
    expect(table.get('r_initial')).toBeUndefined();
  });

  it('should match requests with path prefixes (e.g. /auth/login matching /login route)', () => {
    const table = new RouteTable();
    table.set({
      id: 'login_route',
      method: 'POST',
      urlPattern: '/login',
      statusCode: 200,
      body: { accessToken: 'xyz' },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    expect(table.match('POST', '/login')?.id).toBe('login_route');

    expect(table.match('POST', '/auth/login')?.id).toBe('login_route');
    expect(table.match('POST', '/api/v1/auth/login')?.id).toBe('login_route');

    expect(table.match('POST', '/relogin')).toBeUndefined();
    expect(table.match('POST', '/auth/login/verify')).toBeUndefined();
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

  it('should serve offline vector SVG placeholders for image requests', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    const resPoster = await makeRequest(proxy.port, '/sample_poster_path.jpg');
    expect(resPoster.statusCode).toBe(200);
    expect(resPoster.headers['content-type']).toContain('image/svg+xml');
    expect(resPoster.body).toContain('<svg');
    expect(resPoster.body).toContain('Poster Asset');

    const resAvatar = await makeRequest(proxy.port, '/users/avatar.png');
    expect(resAvatar.statusCode).toBe(200);
    expect(resAvatar.headers['content-type']).toContain('image/svg+xml');
    expect(resAvatar.body).toContain('User Avatar');
  });

  it('should verify stateful 2FA TOTP codes accurately', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    const resValid = await makeRequest(
      proxy.port,
      '/api/auth/2fa/verify',
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ code: '123456' })
    );
    expect(resValid.statusCode).toBe(200);
    const validBody = JSON.parse(resValid.body);
    expect(validBody.authenticated).toBe(true);
    expect(validBody.user.twoFactorVerified).toBe(true);
    expect(validBody.accessToken).toBeDefined();

    const resInvalid = await makeRequest(
      proxy.port,
      '/api/auth/2fa/verify',
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ code: '000000' })
    );
    expect(resInvalid.statusCode).toBe(401);
    const invalidBody = JSON.parse(resInvalid.body);
    expect(invalidBody.code).toBe('MFA_CODE_INVALID');
  });

  it('should switch route responses based on active scenario variants', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    proxy.addRoute({
      id: 'route_users',
      method: 'GET',
      urlPattern: '/api/users',
      statusCode: 200,
      body: [{ id: 1, name: 'Alex' }],
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
      scenario: 'mfa200',
      variants: {
        ok200: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: [{ id: 1, name: 'Alex' }],
          rawBody: JSON.stringify([{ id: 1, name: 'Alex' }]),
        },
        mfa200: {
          statusCode: 200,
          statusText: 'OK',
          headers: {},
          body: { mfaRequired: true, mfaType: 'totp' },
          rawBody: JSON.stringify({ mfaRequired: true, mfaType: 'totp' }),
        },
      },
    });

    const res = await makeRequest(proxy.port, '/api/users');
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.mfaRequired).toBe(true);
  });

  it('should automatically fulfill unmocked companion profile and refresh requests', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    const resMe = await makeRequest(proxy.port, '/auth/me');
    expect(resMe.statusCode).toBe(200);
    const parsedMe = JSON.parse(resMe.body);
    expect(parsedMe.success).toBe(true);
    expect(parsedMe.user.email).toBe('dev@example.com');
    expect(parsedMe.data.user.id).toBe('usr_dev_1');
    expect(parsedMe.role).toBe('admin');

    const resRefresh = await makeRequest(
      proxy.port,
      '/auth/refresh',
      'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ refreshToken: 'test' })
    );
    expect(resRefresh.statusCode).toBe(200);
    const parsedRefresh = JSON.parse(resRefresh.body);
    expect(parsedRefresh.success).toBe(true);
    expect(parsedRefresh.accessToken).toContain('eyJhbGci');
    expect(parsedRefresh.data.accessToken).toBe(parsedRefresh.accessToken);
    expect(parsedRefresh.tokenType).toBe('Bearer');
  });

  it('should preserve cross-endpoint referential integrity (:id detail lookup, query filters, POST/PUT/DELETE persistence)', async () => {
    proxy = new RuntimeProxy(0);
    await proxy.start();

    proxy.addRoute({
      id: 'route_loans_list',
      method: 'GET',
      urlPattern: '/loans',
      statusCode: 200,
      body: [
        { id: 'id_1001', friendlyName: 'Home Loan', status: 1, currency: 'USD', loanAmount: 15000 },
        { id: 'id_1002', friendlyName: 'Auto Loan', status: 2, currency: 'GEL', loanAmount: 25000 },
      ],
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    proxy.addRoute({
      id: 'route_loan_detail',
      method: 'GET',
      urlPattern: '/loans/:id',
      statusCode: 200,
      body: { id: 'id_1001', friendlyName: 'Default', status: 1, currency: 'USD', loanAmount: 1000 },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    proxy.addRoute({
      id: 'route_loan_update',
      method: 'PUT',
      urlPattern: '/loans/:id',
      statusCode: 200,
      body: { id: 'id_1001', friendlyName: 'Default', status: 1 },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    proxy.addRoute({
      id: 'route_loan_delete',
      method: 'DELETE',
      urlPattern: '/loans/:id',
      statusCode: 200,
      body: { success: true },
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    });

    const detailRes = await makeRequest(proxy.port, '/loans/id_1002');
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.body);
    expect(detailBody.id).toBe('id_1002');
    expect(detailBody.friendlyName).toBe('Auto Loan');
    expect(detailBody.currency).toBe('GEL');

    const filteredRes = await makeRequest(proxy.port, '/loans?status=2');
    const filteredList = JSON.parse(filteredRes.body);
    expect(filteredList).toHaveLength(1);
    expect(filteredList[0].id).toBe('id_1002');

    await makeRequest(
      proxy.port,
      '/loans/id_1002',
      'PUT',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ friendlyName: 'Updated EV Loan' })
    );
    const updatedDetail = JSON.parse((await makeRequest(proxy.port, '/loans/id_1002')).body);
    expect(updatedDetail.friendlyName).toBe('Updated EV Loan');

    await makeRequest(proxy.port, '/loans/id_1001', 'DELETE');
    const remainingList = JSON.parse((await makeRequest(proxy.port, '/loans')).body);
    expect(remainingList).toHaveLength(1);
    expect(remainingList[0].id).toBe('id_1002');
  });
});

