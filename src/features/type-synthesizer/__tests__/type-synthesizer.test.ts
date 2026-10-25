import { describe, it, expect } from 'vitest';
import {
  unwrapTypeWrappers,
  synthesizePayload,
  generateMockVariants,
  TypeSynthesizerEngine,
  synthesizeStringValue,
  synthesizeNumberValue,
  synthesizeBooleanValue,
  generateMockJwt,
  generateAuthScenarios,
  isAuthEndpoint,
  is2faEndpoint,
  detectImageType,
  generatePlaceholderSvg,
  generatePlaceholderDataUri,
  datasetProvider,
} from '../index';

describe('type-synthesizer', () => {
  it('should unwrap generic wrappers cleanly', () => {
    expect(unwrapTypeWrappers('Promise<User>')).toBe('User');
    expect(unwrapTypeWrappers('AxiosResponse<Product[]>')).toBe('Product[]');
    expect(unwrapTypeWrappers('ApiResponse<Order>')).toBe('Order');
    expect(unwrapTypeWrappers('Promise<AxiosResponse<Customer>>')).toBe('Customer');
    expect(unwrapTypeWrappers('Observable<Notification>')).toBe('Notification');
  });

  it('should test string and number heuristics thoroughly', () => {
    expect(synthesizeStringValue('userUuid')).toBe('c9bf9e57-1685-4c89-bafb-ff5af830be8a');
    expect(synthesizeStringValue('contactPhone')).toBe('+1 (555) 019-2834');
    expect(synthesizeStringValue('jobTitle')).toBe('Sample jobTitle');
    expect(synthesizeStringValue('userBio')).toBe('Sample description for userBio.');
    expect(synthesizeStringValue('accountStatus')).toBe('active');
    expect(synthesizeStringValue('jwtToken')).toContain('eyJhbGci');
    expect(synthesizeStringValue('genericField')).toBe('sample_genericField');

    expect(synthesizeNumberValue('userAge')).toBe(29);
    expect(synthesizeNumberValue('calendarYear')).toBe(2026);
    expect(synthesizeNumberValue('customerRating')).toBe(4.8);
    expect(synthesizeNumberValue('userId')).toBe(101);
    expect(synthesizeNumberValue('itemCount')).toBe(5);
    expect(synthesizeNumberValue('genericNum')).toBe(42);

    expect(synthesizeBooleanValue('isActive')).toBe(true);
  });

  it('should synthesize realistic mock values for interfaces based on heuristics', () => {
    const code = `
      interface UserAccount {
        id: string;
        email: string;
        name: string;
        avatarUrl: string;
        createdAt: string;
        totalOrders: number;
        priceCents: number;
        isActive: boolean;
      }
    `;

    const result = synthesizePayload('UserAccount', null, code);
    expect(result.statusCode).toBe(200);
    const body = result.body as Record<string, unknown>;

    expect(body['id']).toBe('id_1001');
    expect(body['email']).toBe('dev@example.com');
    expect(body['name']).toBe('John Doe');
    expect(body['avatarUrl']).toBe('https://images.unsplash.com/photo-example');
    expect(body['createdAt']).toBe('2026-10-18T12:00:00Z');
    expect(body['totalOrders']).toBe(5);
    expect(body['priceCents']).toBe(2499);
    expect(body['isActive']).toBe(true);
  });

  it('should handle array types and primitive types directly', () => {
    const code = `
      interface Product {
        id: string;
        title: string;
      }
    `;

    const result = synthesizePayload('Product[]', null, code);
    expect(Array.isArray(result.body)).toBe(true);
    const list = result.body as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]!['id']).toBe('id_1001');
    expect(list[0]!['title']).toBe('Sample title');

    const engine = new TypeSynthesizerEngine();
    expect(engine.synthesize('string')).toBe('sample_sample');
    expect(engine.synthesize('number')).toBe(2499);
    expect(engine.synthesize('boolean')).toBe(true);
    expect(engine.synthesize('void')).toBeNull();
    expect(engine.synthesize('unknown')).toEqual({ sampleKey: 'sampleValue' });
  });

  it('should safely guard against recursive / self-referencing types', () => {
    const code = `
      interface CategoryTree {
        id: string;
        name: string;
        subcategories: CategoryTree[];
      }
    `;

    const engine = new TypeSynthesizerEngine(code);
    const mock = engine.synthesize('CategoryTree', { maxDepth: 3 });
    expect(mock).toBeDefined();

    const cat = mock as any;
    expect(cat.id).toBe('id_1001');
    expect(Array.isArray(cat.subcategories)).toBe(true);
    expect(cat.subcategories[0].id).toBe('id_1001');
  });

  it('should synthesize unions, type literals, and enums', () => {
    const code = `
      enum UserRole {
        Admin = 'ADMIN',
        Editor = 'EDITOR',
        Viewer = 'VIEWER'
      }

      type Status = 'pending' | 'completed' | 'cancelled';

      interface Task {
        role: UserRole;
        status: Status;
        details: { notes: string; code: number };
      }
    `;

    const result = synthesizePayload('Task', null, code);
    const body = result.body as any;
    expect(body.role).toBe('ADMIN');
    expect(body.status).toBe('pending');
    expect(body.details.notes).toBe('sample_notes');
    expect(body.details.code).toBe(42);
  });

  it('should generate standard mock status variants (200, 400, 500, 204)', () => {
    const variants = generateMockVariants('SimpleItem', null, 'interface SimpleItem { id: string; }');
    expect(variants.ok200.statusCode).toBe(200);
    expect(variants.bad400.statusCode).toBe(400);
    expect(variants.server500.statusCode).toBe(500);
    expect(variants.empty204.statusCode).toBe(204);

    expect(variants.bad400.rawBody).toContain('ERR_INVALID_INPUT');
    expect(variants.server500.rawBody).toContain('Internal Server Error');

    const fallbackVariants = generateMockVariants();
    expect(fallbackVariants.ok200.statusCode).toBe(200);
  });

  it('should synthesize inline object literals such as { results: SearchResultItem[] }', () => {
    const code = `
      export interface SearchResultItem {
        id: number;
        title: string;
        overview: string;
        poster_path: string;
        vote_average: number;
      }
    `;

    const result = synthesizePayload('{ results: SearchResultItem[] }', null, code);
    expect(result.statusCode).toBe(200);
    const body = result.body as any;
    expect(body).toHaveProperty('results');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results).toHaveLength(1);

    const item = body.results[0];
    expect(item.id).toBe(101);
    expect(item.title).toBe('Sample title');
    expect(item.overview).toBe('Sample description for overview.');
    expect(item.poster_path).toBe('/sample_asset.jpg');
    expect(item.vote_average).toBe(8.4);
  });

  it('should synthesize interface inheritance (extends) and intersection types (&)', () => {
    const code = `
      interface MediaBase {
        id: number;
        popularity: number;
      }

      interface MovieDetails extends MediaBase {
        title: string;
        tagline: string;
      }

      type TaggedMovie = MovieDetails & { media_type: 'movie'; adult: boolean };
    `;

    const movieResult = synthesizePayload('MovieDetails', null, code);
    const movieBody = movieResult.body as any;
    expect(movieBody.id).toBe(101);
    expect(movieBody.title).toBe('Sample title');
    expect(movieBody.popularity).toBe(42);

    const taggedResult = synthesizePayload('TaggedMovie', null, code);
    const taggedBody = taggedResult.body as any;
    expect(taggedBody.id).toBe(101);
    expect(taggedBody.media_type).toBe('movie');
    expect(taggedBody.adult).toBe(false);
  });

  it('should generate valid offline JWT tokens and 2FA authentication scenarios', () => {
    const jwt = generateMockJwt({ sub: 'usr_custom_123', roles: ['admin'] });
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);

    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString('utf-8'));
    expect(payload.sub).toBe('usr_custom_123');
    expect(payload.roles).toContain('admin');
    expect(payload.mfa_verified).toBe(true);

    expect(isAuthEndpoint('/api/auth/login')).toBe(true);
    expect(isAuthEndpoint('/api/auth/2fa/verify')).toBe(true);
    expect(is2faEndpoint('/api/auth/2fa/verify')).toBe(true);
    expect(is2faEndpoint('/api/search/movies')).toBe(false);

    const scenarios = generateAuthScenarios();
    expect(scenarios.loginSuccess.accessToken).toBeDefined();
    expect(scenarios.mfaChallenge.mfaRequired).toBe(true);
    expect(scenarios.mfaChallenge.mfaType).toBe('totp');
    expect(scenarios.mfaVerified.twoFactorVerified).toBe(true);
    expect(scenarios.mfaInvalid.code).toBe('MFA_CODE_INVALID');
  });

  it('should generate deterministic 100% offline SVG placeholder images with zero egress', () => {
    const posterOpts = detectImageType('poster_path');
    expect(posterOpts.type).toBe('poster');
    expect(posterOpts.width).toBe(500);
    expect(posterOpts.height).toBe(750);

    const avatarOpts = detectImageType('avatarUrl');
    expect(avatarOpts.type).toBe('avatar');

    const svg = generatePlaceholderSvg(posterOpts);
    expect(svg).toContain('<svg');
    expect(svg).toContain('500');
    expect(svg).toContain('750');
    expect(svg).toContain('MockScope Offline');

    const dataUri = generatePlaceholderDataUri(posterOpts);
    expect(dataUri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
  });

  it('should construct comprehensive diverse response variants including 2FA, 401, 429, and empty states', () => {
    const movieVariants = generateMockVariants('{ results: string[] }');
    expect(movieVariants.ok200.statusCode).toBe(200);
    expect(movieVariants.loading200).toBeDefined();
    expect(movieVariants.loading200?.statusCode).toBe(200);
    expect(movieVariants.loading200?.schemaDescription).toContain('Loading State');
    expect(movieVariants.empty200.statusCode).toBe(200);
    expect((movieVariants.empty200.body as any).results).toEqual([]);
    expect(movieVariants.mfa200.statusCode).toBe(200);
    expect((movieVariants.mfa200.body as any).mfaRequired).toBe(true);
    expect(movieVariants.unauth401.statusCode).toBe(401);
    expect(movieVariants.forbidden403.statusCode).toBe(403);
    expect(movieVariants.notFound404.statusCode).toBe(404);
    expect((movieVariants.notFound404.body as any).code).toBe('ERR_NOT_FOUND');
    expect(movieVariants.rateLimit429.statusCode).toBe(429);
    expect(movieVariants.bad400.statusCode).toBe(400);
    expect(movieVariants.server500.statusCode).toBe(500);
    expect(movieVariants.empty204.statusCode).toBe(204);

    const authVariants = generateMockVariants(undefined, null, undefined, undefined, '/api/auth/login');
    expect(authVariants.ok200.statusCode).toBe(200);
    expect((authVariants.ok200.body as any).accessToken).toBeDefined();
    expect((authVariants.ok200.body as any).user.email).toBe('dev@example.com');

    const verifyVariants = generateMockVariants(undefined, null, undefined, undefined, '/api/auth/2fa/verify');
    expect(verifyVariants.ok200.statusCode).toBe(200);
    expect((verifyVariants.ok200.body as any).twoFactorVerified).toBe(true);
    expect((verifyVariants.bad400.body as any).code).toBe('MFA_CODE_INVALID');
  });

  it('should prioritize user custom interface for auth endpoints over generic mockup', () => {
    const code = `
      export interface CustomLoginResult {
        jwtToken: string;
        roles: string[];
        customAccountId: number;
      }
    `;
    const variants = generateMockVariants('CustomLoginResult', null, code, undefined, '/auth/login');
    expect(variants.ok200.statusCode).toBe(200);
    const body = variants.ok200.body as any;
    expect(body.jwtToken).toBeDefined();
    expect(body.customAccountId).toBeDefined();
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.user).toBeUndefined();
  });

  it('should generate Self-Compatible Hybrid Envelopes satisfying data, result, and root access', () => {
    const code = `
      export interface UserLoginSuccess {
        accessToken: string;
        roles: string[];
      }
    `;
    const res = synthesizePayload('UserLoginSuccess', null, code);
    const body = res.body as any;

    expect(body.accessToken).toBeDefined();
    expect(body.token).toBe(body.accessToken);
    expect(body.jwt).toBe(body.accessToken);
    expect(body.access_token).toBe(body.accessToken);
    expect(body.tokenType).toBe('Bearer');
    expect(body.token_type).toBe('Bearer');

    expect(body.data).toBeDefined();
    expect(body.data.accessToken).toBe(body.accessToken);
    expect(body.data.roles).toEqual(body.roles);

    expect(body.result).toBeDefined();
    expect(body.result.accessToken).toBe(body.accessToken);

    expect(body.payload).toBeDefined();
    expect(body.payload.accessToken).toBe(body.accessToken);

    expect(body.success).toBe(true);
    expect(body.isSuccess).toBe(true);
    expect(body.status).toBe(200);
  });

  it('should resolve generic type instantiations (PaginatedResponse<T>), responseConstraints, and polarity-safe heuristics', () => {
    const code = `
      export interface PaginatedResponse<T> {
        items: T[];
        pageInfo: {
          hasNextPage: boolean;
          nextCursor: string | null;
        };
      }

      export interface ITransactions {
        id: string;
        amount: number;
        transactionType: 'credit' | 'debit';
        currency: string;
        iban: string;
      }

      export interface ILoginResponse {
        status: string;
        challengeId: string;
        resendTimeoutMs: number;
        isHidden: boolean;
      }
    `;

    const paginated = synthesizePayload('PaginatedResponse<ITransactions>', null, code);
    const pBody = paginated.body as any;
    expect(Array.isArray(pBody.items)).toBe(true);
    expect(pBody.items.length).toBeGreaterThanOrEqual(2);
    expect(pBody.items[0].transactionType).toBe('credit');
    expect(pBody.items[1].transactionType).toBe('debit');
    expect(pBody.items[0].iban).toBe('GE29NB0000000101904917');
    expect(pBody.pageInfo.hasNextPage).toBe(false);

    const loginRes = synthesizePayload('ILoginResponse', null, code, undefined, {
      status: ['mfa_required', 'phone_verification_required'],
    });
    const lBody = loginRes.body as any;
    expect(lBody.status).toBe('mfa_required');
    expect(lBody.resendTimeoutMs).toBe(60000);
    expect(lBody.isHidden).toBe(false);
  });

  it('should synthesize utility types (Pick, Omit, Record), omit optional error fields, and enforce sibling coherence', () => {
    const code = `
      export enum CardPermission {
        allowAtm = 'allowAtm',
        allowOnline = 'allowOnline',
      }

      export interface ILoan {
        id: string;
        accountId: string;
        status: number;
        statusName: string;
        currency: string;
        symbol?: string;
        minAmount: number;
        maxAmount: number;
        error?: string;
      }

      export interface CardAccount {
        id: string;
        cardIds: string[];
        imageBase64: string;
      }

      export type LoanPreview = Pick<ILoan, 'id' | 'accountId' | 'status' | 'statusName'>;
      export type LoanWithoutMinMax = Omit<ILoan, 'minAmount' | 'maxAmount'>;
      export type PermissionMap = Record<CardPermission, string>;
    `;

    const loanRes = synthesizePayload('ILoan[]', null, code);
    const loans = loanRes.body as any[];
    expect(Array.isArray(loans)).toBe(true);
    expect(loans.length).toBe(3);
    expect(loans[0].id).toBe('id_1001');
    expect(loans[0].accountId).toBe('id_1001');
    expect(loans[0].status).toBe(1);
    expect(loans[0].statusName).toBe('Pending');
    expect(loans[1].status).toBe(2);
    expect(loans[1].statusName).toBe('Approved');
    expect(loans[0].error).toBeUndefined();
    expect(loans[0].minAmount).toBeLessThan(loans[0].maxAmount);

    const cardAcc = synthesizePayload('CardAccount', null, code).body as any;
    expect(cardAcc.cardIds).toEqual(['id_1001', 'id_1002', 'id_1003']);
    expect(cardAcc.imageBase64).toContain('data:image/svg+xml;base64,');

    const picked = synthesizePayload('LoanPreview', null, code).body as any;
    expect(picked.id).toBe('id_1001');
    expect(picked.accountId).toBe('id_1001');
    expect(picked.minAmount).toBeUndefined();

    const omitted = synthesizePayload('LoanWithoutMinMax', null, code).body as any;
    expect(omitted.id).toBe('id_1001');
    expect(omitted.minAmount).toBeUndefined();

    const recordMap = synthesizePayload('PermissionMap', null, code).body as any;
    expect(recordMap.allowAtm).toBeDefined();
    expect(recordMap.allowOnline).toBeDefined();
  });

  it('should seed diverse multi-domain records across indices and fallback gracefully when external dataset fetch fails', async () => {
    const code = `
      export interface CustomerOrder {
        id: string;
        fullName: string;
        email: string;
        iban: string;
        productName: string;
        brand: string;
        city: string;
        country: string;
        createdAt: string;
      }
    `;

    const orders = synthesizePayload('CustomerOrder[]', null, code).body as any[];
    expect(orders).toHaveLength(3);
    expect(orders[0].fullName).not.toBe(orders[1].fullName);
    expect(orders[1].fullName).not.toBe(orders[2].fullName);
    expect(orders[0].email).not.toBe(orders[1].email);
    expect(orders[0].iban).not.toBe(orders[1].iban);
    expect(orders[0].productName).not.toBe(orders[1].productName);
    expect(orders[0].city).not.toBe(orders[1].city);
    expect(orders[0].createdAt).not.toBe(orders[1].createdAt);

    const fetched = await datasetProvider.fetchLoopbackDatasetWithFallback(59999);
    expect(fetched).toBe(false);
    expect(datasetProvider.getFullName(0)).toBe('John Doe');

    datasetProvider.applyCustomPools({ fullNames: ['Custom Seed User'] });
    expect(datasetProvider.getFullName(0)).toBe('Custom Seed User');
    datasetProvider.resetCustomPools();
    expect(datasetProvider.getFullName(0)).toBe('John Doe');
  });
});

