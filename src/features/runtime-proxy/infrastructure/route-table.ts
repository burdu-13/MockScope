import type { MockRoute } from '../../../shared/kernel/index';

export class RouteTable {
  private routes: Map<string, MockRoute> = new Map();

  public set(route: MockRoute): void {
    this.routes.set(route.id, route);
  }

  public delete(id: string): boolean {
    return this.routes.delete(id);
  }

  public get(id: string): MockRoute | undefined {
    return this.routes.get(id);
  }

  public getAll(): MockRoute[] {
    return Array.from(this.routes.values());
  }

  public clear(): void {
    this.routes.clear();
  }

  public match(method: string, pathname: string): MockRoute | undefined {
    const upperMethod = method.toUpperCase();

    for (const route of this.routes.values()) {
      if (!route.enabled) {
        continue;
      }

      if (route.method !== '*' && route.method !== upperMethod) {
        continue;
      }

      if (this.matchesPattern(pathname, route.urlPattern)) {
        return route;
      }
    }

    return undefined;
  }

  private matchesPattern(rawUrlOrPath: string, pattern: string): boolean {
    let cleanPath = rawUrlOrPath.split('?')[0]!.replace(/\/+$/, '') || '/';
    let querySubPath: string | undefined;

    try {
      if (rawUrlOrPath.startsWith('http://') || rawUrlOrPath.startsWith('https://')) {
        const parsed = new URL(rawUrlOrPath);
        cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
        const q = parsed.searchParams.get('path') || parsed.searchParams.get('url') || parsed.searchParams.get('endpoint');
        if (q) {
          querySubPath = ('/' + q.replace(/^\/+/, '')).replace(/\/+$/, '');
        }
      } else if (rawUrlOrPath.includes('?')) {
        const queryPart = rawUrlOrPath.split('?')[1] || '';
        const params = new URLSearchParams(queryPart);
        const q = params.get('path') || params.get('url') || params.get('endpoint');
        if (q) {
          querySubPath = ('/' + q.replace(/^\/+/, '')).replace(/\/+$/, '');
        }
      }
    } catch {
    }

    let cleanPattern = pattern.split('?')[0]!.replace(/\/+$/, '') || '/';
    try {
      if (cleanPattern.startsWith('http://') || cleanPattern.startsWith('https://')) {
        const parsed = new URL(cleanPattern);
        cleanPattern = parsed.pathname.replace(/\/+$/, '') || '/';
      }
    } catch {
    }

    if (cleanPattern === cleanPath || (querySubPath && cleanPattern === querySubPath)) {
      return true;
    }

    const regexPattern = cleanPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars except *
      .replace(/:[a-zA-Z0-9_]+/g, '[^/]+')   // Named parameters :id -> [^/]+
      .replace(/\*/g, '.*');                 // Wildcard * -> .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    if (regex.test(cleanPath)) {
      return true;
    }
    if (querySubPath && regex.test(querySubPath)) {
      return true;
    }
    return false;
  }
}
