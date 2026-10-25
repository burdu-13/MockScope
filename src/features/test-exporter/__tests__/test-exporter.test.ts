import { describe, it, expect } from 'vitest';
import { generatePlaywrightSpec, generateMswHandler } from '../index';
import type { DetectedApiCall, GeneratedMock } from '../../../shared/kernel/index';

describe('test-exporter', () => {
  const sampleCall: DetectedApiCall = {
    id: 'c1',
    method: 'GET',
    url: '/api/v1/users',
    clientType: 'fetch',
    typeArgument: 'User[]',
    range: { start: { line: 10, character: 4 }, end: { line: 10, character: 30 } },
    rawExpression: "fetch('/api/v1/users')",
  };

  const sampleMock: GeneratedMock = {
    statusCode: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: [{ id: 'usr_1', name: 'Alex' }],
    rawBody: JSON.stringify([{ id: 'usr_1', name: 'Alex' }], null, 2),
    schemaDescription: 'Test mock',
  };

  it('should generate valid Playwright spec for GET call', () => {
    const code = generatePlaywrightSpec(sampleCall, sampleMock);
    expect(code).toContain("page.route('**/api/v1/users'");
    expect(code).toContain('status: 200');
    expect(code).toContain('"name": "Alex"');
  });

  it('should generate valid Playwright spec with method check for POST call', () => {
    const postCall: DetectedApiCall = {
      ...sampleCall,
      method: 'POST',
      url: '/api/v1/users/create',
    };
    const code = generatePlaywrightSpec(postCall, { ...sampleMock, statusCode: 201 });
    expect(code).toContain("route.request().method() === 'POST'");
    expect(code).toContain('status: 201');
    expect(code).toContain('route.fallback()');
  });

  it('should generate modern MSW v2 handler', () => {
    const code = generateMswHandler(sampleCall, sampleMock);
    expect(code).toContain("http.get('/api/v1/users'");
    expect(code).toContain('HttpResponse.json(');
    expect(code).toContain('status: 200');
    expect(code).toContain('"name": "Alex"');
  });

  it('should generate MSW v2 handler for other HTTP methods', () => {
    const delCall: DetectedApiCall = {
      ...sampleCall,
      method: 'DELETE',
      url: '/api/v1/users/usr_1',
    };
    const code = generateMswHandler(delCall, { ...sampleMock, statusCode: 204, body: null });
    expect(code).toContain("http.delete('/api/v1/users/usr_1'");
    expect(code).toContain('status: 204');
  });
  it('should default to status 200 when mock status code is omitted', () => {
    const rawPayload = { message: 'success' };
    const mswCode = generateMswHandler(sampleCall, rawPayload as any);
    expect(mswCode).toContain('status: 200');
    expect(mswCode).toContain('"message": "success"');

    const playwrightCode = generatePlaywrightSpec(sampleCall, rawPayload as any);
    expect(playwrightCode).toContain('status: 200');
    expect(playwrightCode).toContain('"message": "success"');
  });
});
