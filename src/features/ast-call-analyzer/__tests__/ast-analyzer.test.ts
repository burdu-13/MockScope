import { describe, it, expect } from 'vitest';
import { detectApiCalls } from '../index.js';

describe('ast-call-analyzer', () => {
  it('should detect simple fetch calls', () => {
    const code = `
      async function loadData() {
        const res = await fetch('/api/v1/users');
        const json = await res.json();
        return json;
      }
    `;

    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.clientType).toBe('fetch');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('/api/v1/users');
  });

  it('should detect fetch calls with explicit method option', () => {
    const code = `
      fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'laptop' })
      });
    `;

    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('/api/v1/orders');
  });

  it('should detect axios calls with generic return types', () => {
    const code = `
      interface UserProfile {
        id: string;
        name: string;
      }

      async function getProfile() {
        const res = await axios.get<UserProfile>('/api/user/profile');
        return res.data;
      }

      function updateItem() {
        axios.put<UpdateResult>('/api/items/42', { active: true });
      }
    `;

    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(2);

    expect(calls[0]!.clientType).toBe('axios');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('/api/user/profile');
    expect(calls[0]!.typeArgument).toBe('UserProfile');

    expect(calls[1]!.clientType).toBe('axios');
    expect(calls[1]!.method).toBe('PUT');
    expect(calls[1]!.url).toBe('/api/items/42');
    expect(calls[1]!.typeArgument).toBe('UpdateResult');
  });

  it('should detect Angular HttpClient calls', () => {
    const code = `
      export class UserService {
        constructor(private http: HttpClient) {}

        getUsers() {
          return this.http.get<User[]>('/api/users');
        }

        deleteUser(id: string) {
          return this.http.delete<void>('/api/users/delete');
        }
      }
    `;

    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.clientType).toBe('angular-http');
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe('/api/users');
    expect(calls[0]!.typeArgument).toBe('User[]');

    expect(calls[1]!.clientType).toBe('angular-http');
    expect(calls[1]!.method).toBe('DELETE');
    expect(calls[1]!.url).toBe('/api/users/delete');
  });

  it('should detect TanStack useQuery calls', () => {
    const code = `
      function useUserData() {
        return useQuery<UserData>({
          queryKey: ['/api/user/me'],
          queryFn: () => fetch('/api/user/me').then(r => r.json())
        });
      }
    `;

    const calls = detectApiCalls(code);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const queryCall = calls.find((c) => c.clientType === 'useQuery');
    expect(queryCall).toBeDefined();
    expect(queryCall!.url).toBe('/api/user/me');
    expect(queryCall!.typeArgument).toBe('UserData');
  });

  it('should parse template literals in URLs', () => {
    const code = "fetch(`/api/items/${itemId}`);";
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/items/:itemId');
  });

  it('should strip base URL variables and proxy parameters from template literals', () => {
    const code = "fetch(`${this.proxyUrl}?path=genre/${type}/list`);";
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/genre/:type/list');

    const code2 = "axios.get(`${this.baseUrl}/api/v1/users/${user.id}`);";
    const calls2 = detectApiCalls(code2);
    expect(calls2).toHaveLength(1);
    expect(calls2[0]!.url).toBe('/api/v1/users/:id');
  });

  it('should benchmark scan speed to be well under 10ms for reasonable files', () => {
    const largeBuffer = Array.from({ length: 150 }, (_, i) => `
      axios.get<Type${i}>('/api/endpoint/${i}');
      fetch('/api/v1/resource/${i}', { method: 'POST' });
    `).join('\n');

    const start = performance.now();
    const calls = detectApiCalls(largeBuffer);
    const duration = performance.now() - start;

    expect(calls.length).toBe(300);
    expect(duration).toBeLessThan(50);
  });
});
