import type { MockRoute } from '../../../shared/kernel/index';

export class RouteTable {
  private routes: Map<string, MockRoute> = new Map();

  public set(route: MockRoute): void {
    for (const [id, existing] of this.routes.entries()) {
      if (
        id !== route.id &&
        existing.method.toUpperCase() === route.method.toUpperCase() &&
        existing.urlPattern === route.urlPattern
      ) {
        this.routes.delete(id);
      }
    }
    this.routes.set(route.id, route);
  }

  public findExact(method: string, urlPattern: string): MockRoute | undefined {
    const upperMethod = method.toUpperCase();
    for (const route of this.routes.values()) {
      const routeMethod = (route.method || 'GET').toUpperCase();
      if (
        (routeMethod === '*' || routeMethod === upperMethod) &&
        route.urlPattern === urlPattern
      ) {
        return route;
      }
    }
    return undefined;
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
      if (route.method !== '*' && route.method.toUpperCase() !== upperMethod) {
        continue;
      }
      if (this.matchesPattern(pathname, route.urlPattern, false)) {
        return route;
      }
    }

    for (const route of this.routes.values()) {
      if (!route.enabled) {
        continue;
      }
      if (route.method !== '*' && route.method.toUpperCase() !== upperMethod) {
        continue;
      }
      if (this.matchesPattern(pathname, route.urlPattern, true)) {
        return route;
      }
    }

    return undefined;
  }

  private matchesPattern(
    rawUrlOrPath: string,
    pattern: string,
    allowSuffix: boolean = false
  ): boolean {
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

    if (!cleanPattern.startsWith('/')) {
      cleanPattern = '/' + cleanPattern;
    }
    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    if (cleanPattern === cleanPath || (querySubPath && cleanPattern === querySubPath)) {
      return true;
    }

    const normalizedPattern = cleanPattern.replace(/\{([a-zA-Z0-9_]+)\}/g, ':$1');
    const regexPattern = normalizedPattern
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

    if (allowSuffix && cleanPattern !== '/' && cleanPattern.length > 1) {
      const stripped = regexPattern.replace(/^\\?\//, '');
      const suffixRegex = new RegExp(`(?:^|\\/)${stripped}$`, 'i');
      if (suffixRegex.test(cleanPath)) {
        return true;
      }
      if (querySubPath && suffixRegex.test(querySubPath)) {
        return true;
      }
    }

    return false;
  }
}
