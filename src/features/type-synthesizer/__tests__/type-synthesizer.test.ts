import { describe, it, expect } from 'vitest';
import {
  unwrapTypeWrappers,
  synthesizePayload,
  generateMockVariants,
  TypeSynthesizerEngine,
  synthesizeStringValue,
  synthesizeNumberValue,
  synthesizeBooleanValue,
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
    expect(synthesizeStringValue('jobTitle')).toBe('Senior Software Architect');
    expect(synthesizeStringValue('userBio')).toBe('High-performance engineering and low-latency systems.');
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

    expect(body['id']).toBe('usr_98a72b');
    expect(body['email']).toBe('alex.developer@example.com');
    expect(body['name']).toBe('Acme Commerce');
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
    expect(list[0]!['id']).toBe('usr_98a72b');
    expect(list[0]!['title']).toBe('Senior Software Architect');

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
    expect(cat.id).toBe('usr_98a72b');
    expect(Array.isArray(cat.subcategories)).toBe(true);
    expect(cat.subcategories[0].id).toBe('usr_98a72b');
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
});
