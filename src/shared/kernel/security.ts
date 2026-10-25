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

export interface JwtClaims {
  sub: string;
  id?: string;
  userId?: string;
  name: string;
  username?: string;
  email: string;
  role?: string;
  roles: string[];
  permissions?: string[];
  mfa_verified: boolean;
  twoFactorVerified?: boolean;
  iat: number;
  nbf?: number;
  exp: number;
  iss?: string;
  aud?: string;
  token_use?: string;
  [key: string]: unknown;
}

export function generateMockJwt(customClaims: Partial<JwtClaims> = {}): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
    kid: 'mockscope-dev-key-1',
  };

  const now = Math.floor(Date.now() / 1000);
  const payload: JwtClaims = {
    iss: 'mockscope-auth',
    aud: 'mockscope-client',
    sub: 'usr_dev_1',
    id: 'usr_dev_1',
    userId: 'usr_dev_1',
    name: 'Dev User',
    fullName: 'Dev User',
    firstName: 'Dev',
    lastName: 'User',
    username: 'devuser',
    email: 'dev@example.com',
    role: 'admin',
    roles: ['user', 'developer', 'admin'],
    permissions: ['read', 'write', 'admin', 'user'],
    mfa_verified: true,
    twoFactorVerified: true,
    token_use: 'access',
    iat: now,
    nbf: now - 60, // 1 min buffer against client clock skew
    exp: now + 31536000, // 1 year validity
    ...customClaims,
  };

  const base64UrlEncode = (obj: unknown): string => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signature = Buffer.from(`mock_sig_${payload.sub}_${payload.exp}`).toString('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export interface MockUserProfile {
  id: string;
  userId: string;
  sub: string;
  email: string;
  name: string;
  fullName: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  roles: string[];
  permissions: string[];
  avatarUrl: string;
  avatar: string;
  theme: string;
  language: string;
  hasCompletedOnboarding: boolean;
  isActive: boolean;
  status: string;
}

export function generateMockUserProfile(custom: Partial<MockUserProfile> = {}): MockUserProfile {
  return {
    id: 'usr_dev_1',
    userId: 'usr_dev_1',
    sub: 'usr_dev_1',
    email: 'dev@example.com',
    name: 'Dev User',
    fullName: 'Dev User',
    firstName: 'Dev',
    lastName: 'User',
    username: 'devuser',
    role: 'admin',
    roles: ['user', 'developer', 'admin'],
    permissions: ['read', 'write', 'admin', 'user'],
    avatarUrl: 'https://images.unsplash.com/photo-example',
    avatar: 'https://images.unsplash.com/photo-example',
    theme: 'dark',
    language: 'en',
    hasCompletedOnboarding: true,
    isActive: true,
    status: 'active',
    ...custom,
  };
}

export function generateCompanionAuthResponse(type: 'profile' | 'refresh' | 'session' = 'profile'): Record<string, unknown> {
  const user = generateMockUserProfile();
  const token = generateMockJwt();
  const refreshToken = 'rt_refresh_token_dev_1';

  if (type === 'refresh') {
    const base: Record<string, unknown> = {
      accessToken: token,
      token,
      jwt: token,
      access_token: token,
      refreshToken,
      refresh_token: refreshToken,
      tokenType: 'Bearer',
      token_type: 'Bearer',
      expiresIn: 86400,
      expires_in: 86400,
      user,
    };
    return {
      success: true,
      isSuccess: true,
      status: 200,
      message: 'Token refreshed successfully',
      data: base,
      result: base,
      payload: base,
      ...base,
    };
  }

  const base: Record<string, unknown> = {
    user,
    ...user,
    authenticated: true,
    token,
    accessToken: token,
    jwt: token,
    roles: user.roles,
    permissions: user.permissions,
  };

  return {
    success: true,
    isSuccess: true,
    status: 200,
    message: 'User profile retrieved successfully',
    data: base,
    result: base,
    payload: base,
    ...base,
  };
}

