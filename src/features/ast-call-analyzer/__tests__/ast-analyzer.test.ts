import { describe, it, expect } from 'vitest';
import { detectApiCalls, parseOpenApiJson, schemaEndpointToApiCall } from '../index.js';

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

  it('should detect modern Angular & Nx patterns with _http, class property URLs, and string concatenation', () => {
    const code = `
      @Injectable({ providedIn: 'root' })
      export class ProductService {
        private readonly apiUrl = '/api/products';
        constructor(private readonly _http: HttpClient) {}

        getProducts() {
          return this._http.get<Product[]>(this.apiUrl);
        }

        getProduct(id: string) {
          return this._http.get<Product>(this.apiUrl + '/' + id);
        }

        updateProduct(id: string, body: any) {
          return this._http.put<Product>(\`\${this.apiUrl}/\${id}\`, body);
        }

        search(term: string) {
          return this._http.request<SearchResult[]>('GET', '/api/search?q=' + term);
        }
      }

      export const userResource = httpResource<User[]>('/api/resources/users');
    `;

    const calls = detectApiCalls(code);
    expect(calls.length).toBe(5);

    expect(calls[0]!.url).toBe('/api/products');
    expect(calls[0]!.clientType).toBe('angular-http');
    expect(calls[0]!.typeArgument).toBe('Product[]');

    expect(calls[1]!.url).toBe('/api/products/:id');
    expect(calls[1]!.clientType).toBe('angular-http');

    expect(calls[2]!.url).toBe('/api/products/:id');
    expect(calls[2]!.clientType).toBe('angular-http');

    expect(calls[3]!.url).toBe('/api/search?q=:term');
    expect(calls[3]!.clientType).toBe('angular-http');

    expect(calls[4]!.url).toBe('/api/resources/users');
    expect(calls[4]!.clientType).toBe('angular-http');
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

  it('should detect ky, ofetch, got, and superagent calls', () => {
    const code = `
      $fetch('/api/ofetch-endpoint');
      ky.post('/api/ky-endpoint');
      got.get('/api/got-endpoint');
      superagent.get('/api/superagent-endpoint');
    `;
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(4);
    expect(calls.some((c) => c.clientType === 'ofetch' && c.url === '/api/ofetch-endpoint')).toBe(true);
    expect(calls.some((c) => c.clientType === 'ky' && c.url === '/api/ky-endpoint' && c.method === 'POST')).toBe(true);
    expect(calls.some((c) => c.clientType === 'got' && c.url === '/api/got-endpoint')).toBe(true);
    expect(calls.some((c) => c.clientType === 'superagent' && c.url === '/api/superagent-endpoint')).toBe(true);
  });

  it('should detect Three.js model and asset loaders', () => {
    const code = `
      const loader = new GLTFLoader();
      loader.load('/models/character.glb', (gltf) => scene.add(gltf.scene));
    `;
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.clientType).toBe('three-loader');
    expect(calls[0]!.url).toBe('/models/character.glb');
  });

  it('should detect SWR hooks and XMLHttpRequest', () => {
    const code = `
      const { data } = useSWR('/api/swr-user', fetcher);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/xhr-data');
    `;
    const calls = detectApiCalls(code);
    expect(calls.some((c) => c.clientType === 'swr' && c.url === '/api/swr-user')).toBe(true);
    expect(calls.some((c) => c.clientType === 'xhr' && c.url === '/api/xhr-data' && c.method === 'POST')).toBe(true);
  });

  it('should infer typeArgument from enclosing method return type (e.g. Observable<LoginResponse>)', () => {
    const code = `
      class AuthService {
        login(credentials: { email: string }): Observable<LoginResponse> {
          return this.http.post('/auth/login', credentials);
        }
      }
    `;
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/auth/login');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.typeArgument).toBe('LoginResponse');
  });

  it('should accurately resolve template baseUrl property into full endpoint path', () => {
    const code = `
      export class AuthService {
        private baseUrl = \`\${environment.apiUrl}/auth\`;
        constructor(private http: HttpClient) {}

        login(user: any) {
          return this.http.post<IloginResponse>(\`\${this.baseUrl}/login\`, user);
        }

        verifyMfa(verify: any) {
          return this.http.post<IMfaVerifyResponse>(\`\${this.baseUrl}/mfa/verify\`, verify);
        }
      }
    `;
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('/auth/login');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.typeArgument).toBe('IloginResponse');

    expect(calls[1]!.url).toBe('/auth/mfa/verify');
    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.typeArgument).toBe('IMfaVerifyResponse');
  });

  it('should normalize full HTTP/HTTPS origin URLs to clean pathnames', () => {
    const code = `
      fetch('https://api.production.domain/v2/catalog/items');
      axios.post('http://localhost:8080/auth/token');
    `;
    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('/v2/catalog/items');
    expect(calls[1]!.url).toBe('/auth/token');
  });

  it('should parse OpenAPI JSON specifications into authoritative endpoints', () => {
    const openApiJson = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0' },
      paths: {
        '/api/v1/users/{id}': {
          get: {
            operationId: 'getUserById',
            summary: 'Fetch user by ID',
            responses: {
              '200': {
                description: 'User details',
                content: {
                  'application/json': {
                    schema: { type: 'object', properties: { id: { type: 'string' } } },
                  },
                },
              },
            },
          },
          delete: {
            operationId: 'deleteUser',
            summary: 'Delete user',
            responses: { '204': { description: 'Deleted' } },
          },
        },
      },
    });

    const endpoints = parseOpenApiJson(openApiJson, '/workspace/openapi.json');
    expect(endpoints).toHaveLength(2);

    const getEp = endpoints.find((e: any) => e.method === 'GET');
    expect(getEp).toBeDefined();
    expect(getEp!.url).toBe('/api/v1/users/:id');
    expect(getEp!.operationId).toBe('getUserById');
    expect(getEp!.responseSchemas?.['200']).toBeDefined();

    const apiCall = schemaEndpointToApiCall(getEp!);
    expect(apiCall.method).toBe('GET');
    expect(apiCall.url).toBe('/api/v1/users/:id');
    expect(apiCall.clientType).toBe('openapi');
    expect(apiCall.typeArgument).toBe('getUserById');
  });

  it('should extract consumer control-flow equality constraints and filter out static i18n/asset calls', () => {
    const code = `
      export class AuthService {
        login(payload: any) {
          return this.http.post<ILoginResponse>('/auth/login', payload).pipe(
            tap((res) => {
              if (res.status === 'mfa_required') {
                this.openMfa(res.challengeId);
              }
              if (res.status === 'phone_verification_required') {
                if (res.reason === 'phone_unverified') {
                  this.verifyPhone();
                }
              }
            })
          );
        }

        loadTranslations() {
          return this.http.get('/i18n/en/dashboard.json');
        }
      }
    `;

    const calls = detectApiCalls(code);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/auth/login');
    expect(calls[0]!.responseConstraints).toBeDefined();
    expect(calls[0]!.responseConstraints!['status']).toEqual([
      'mfa_required',
      'phone_verification_required',
    ]);
    expect(calls[0]!.responseConstraints!['reason']).toEqual(['phone_unverified']);
  });
});

