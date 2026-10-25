import { generatePlaceholderDataUri } from './media-placeholder';
import { generateMockJwt, type JwtClaims } from '../../../shared/kernel/index';

export type JwtPayload = JwtClaims;
export { generateMockJwt };

export function isAuthEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/auth') ||
    lower.includes('/login') ||
    lower.includes('/signin') ||
    lower.includes('/token') ||
    lower.includes('/session') ||
    lower.includes('/user/me') ||
    lower.includes('/profile') ||
    lower.includes('/2fa') ||
    lower.includes('/mfa') ||
    lower.includes('/totp') ||
    lower.includes('/verify')
  );
}

export function is2faEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/2fa') ||
    lower.includes('/mfa') ||
    lower.includes('/totp') ||
    lower.includes('two-factor') ||
    lower.includes('twofactor') ||
    lower.includes('/verify')
  );
}

export interface AuthUserPayload {
  id: string;
  userId?: string | undefined;
  email: string;
  name: string;
  username?: string | undefined;
  role?: string | undefined;
  roles: string[];
  avatarUrl: string;
  twoFactorEnabled?: boolean | undefined;
}

export interface AuthScenarioPayloads {
  loginSuccess: {
    token?: string | undefined;
    accessToken: string;
    access_token?: string | undefined;
    jwt?: string | undefined;
    refreshToken: string;
    refresh_token?: string | undefined;
    tokenType: string;
    token_type?: string | undefined;
    expiresIn: number;
    expires_in?: number | undefined;
    user: AuthUserPayload;
    data?: Record<string, unknown> | undefined;
  };
  mfaChallenge: {
    mfaRequired: true;
    status: '2fa_required';
    mfaType: 'totp';
    mfaToken: string;
    message: string;
    supportedMethods: string[];
    expiresIn: number;
  };
  mfaVerified: {
    authenticated: true;
    twoFactorVerified: true;
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
    user: {
      id: string;
      email: string;
      name: string;
      twoFactorVerified: true;
      avatarUrl: string;
    };
  };
  mfaInvalid: {
    error: string;
    message: string;
    code: string;
    attemptsRemaining: number;
  };
  unauthorized: {
    error: string;
    message: string;
    code: string;
  };
  forbidden: {
    error: string;
    message: string;
    code: string;
  };
}

export function generateAuthScenarios(): AuthScenarioPayloads {
  const avatarUrl = generatePlaceholderDataUri({
    type: 'avatar',
    width: 160,
    height: 160,
    label: 'User',
  });

  const jwt = generateMockJwt({ mfa_verified: true });
  const user: AuthUserPayload = {
    id: 'usr_dev_1',
    userId: 'usr_dev_1',
    email: 'dev@example.com',
    name: 'Dev User',
    username: 'devuser',
    role: 'admin',
    roles: ['user', 'developer', 'admin'],
    avatarUrl,
    twoFactorEnabled: false,
  };

  return {
    loginSuccess: {
      token: jwt,
      accessToken: jwt,
      access_token: jwt,
      jwt,
      refreshToken: 'rt_refresh_token_dev_1',
      refresh_token: 'rt_refresh_token_dev_1',
      tokenType: 'Bearer',
      token_type: 'Bearer',
      expiresIn: 3600,
      expires_in: 3600,
      user,
      data: {
        token: jwt,
        accessToken: jwt,
        access_token: jwt,
        user,
      },
    },
    mfaChallenge: {
      mfaRequired: true,
      status: '2fa_required',
      mfaType: 'totp',
      mfaToken: 'mfa_chal_token_dev_1',
      message: 'Two-factor authentication code required. Please supply your 6-digit TOTP code.',
      supportedMethods: ['totp', 'authenticator_app', 'sms'],
      expiresIn: 300,
    },
    mfaVerified: {
      authenticated: true,
      twoFactorVerified: true,
      accessToken: generateMockJwt({ mfa_verified: true, roles: ['user', 'admin'] }),
      refreshToken: 'rt_refresh_token_dev_1',
      tokenType: 'Bearer',
      expiresIn: 86400,
      user: {
        id: 'usr_dev_1',
        email: 'dev@example.com',
        name: 'Dev User',
        twoFactorVerified: true,
        avatarUrl,
      },
    },
    mfaInvalid: {
      error: 'InvalidVerificationCode',
      message: 'The six-digit verification code provided is incorrect or has expired.',
      code: 'MFA_CODE_INVALID',
      attemptsRemaining: 2,
    },
    unauthorized: {
      error: 'Unauthorized',
      message: 'Authentication credentials are missing, invalid, or expired.',
      code: 'ERR_UNAUTHORIZED',
    },
    forbidden: {
      error: 'Forbidden',
      message: 'Access denied: You do not have permission to access this resource.',
      code: 'ERR_FORBIDDEN',
    },
  };
}
