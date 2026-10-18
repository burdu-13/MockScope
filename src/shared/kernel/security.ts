import * as crypto from 'node:crypto';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
  'api-key',
  'x-auth-token',
  'session-token',
]);

export function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    const stringValue = Array.isArray(value) ? value.join('; ') : String(value);

    if (SENSITIVE_HEADERS.has(lowerKey)) {
      sanitized[lowerKey] = '[REDACTED]';
    } else {
      sanitized[lowerKey] = stringValue;
    }
  }

  return sanitized;
}

export function assertLoopbackHost(host: string): void {
  if (host !== '127.0.0.1') {
    throw new Error(`Security Violation: Host must be strictly '127.0.0.1', received '${host}'.`);
  }
}

export function generateCspNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
