import type { MockRoute } from './types';

interface ParsedTarget {
  cleanPath: string;
  queryString: string;
  querySubPath?: string | undefined;
}

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

  /**
   * Matches an incoming request by HTTP method and URL, prioritizing higher specificity:
   * 4 = Exact static path (+ optional exact query match)
   * 3 = Parameterized path (:param / {param})
   * 2 = Wildcard path (*)
   * 1 = Suffix fallback match (e.g. /api/v1/login -> /login)
   */
  public match(method: string, pathname: string): MockRoute | undefined {
    const upperMethod = method.toUpperCase();
    const target = this.parseTarget(pathname);

    let bestRoute: MockRoute | undefined;
    let bestScore = 0;

    for (const route of this.routes.values()) {
      if (!route.enabled) {
        continue;
      }
      if (route.method !== '*' && route.method.toUpperCase() !== upperMethod) {
        continue;
      }

      const methodBonus = route.method.toUpperCase() === upperMethod ? 0.5 : 0;
      const patternScore = this.scorePatternMatch(target, route.urlPattern);
      if (patternScore > 0) {
        const totalScore = patternScore + methodBonus;
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestRoute = route;
        }
      }
    }

    return bestRoute;
  }

  private parseTarget(rawUrlOrPath: string): ParsedTarget {
    const qIdx = rawUrlOrPath.indexOf('?');
    let cleanPath = (qIdx >= 0 ? rawUrlOrPath.slice(0, qIdx) : rawUrlOrPath).replace(/\/+$/, '') || '/';
    let queryString = qIdx >= 0 ? rawUrlOrPath.slice(qIdx + 1) : '';
    let querySubPath: string | undefined;

    try {
      if (rawUrlOrPath.startsWith('http://') || rawUrlOrPath.startsWith('https://')) {
        const parsed = new URL(rawUrlOrPath);
        cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
        queryString = parsed.search.startsWith('?') ? parsed.search.slice(1) : parsed.search;
        const q = parsed.searchParams.get('path') || parsed.searchParams.get('url') || parsed.searchParams.get('endpoint');
        if (q) {
          querySubPath = ('/' + q.replace(/^\/+/, '')).replace(/\/+$/, '');
        }
      } else if (queryString) {
        const params = new URLSearchParams(queryString);
        const q = params.get('path') || params.get('url') || params.get('endpoint');
        if (q) {
          querySubPath = ('/' + q.replace(/^\/+/, '')).replace(/\/+$/, '');
        }
      }
    } catch {
    }

    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    return { cleanPath, queryString, querySubPath };
  }

  private scorePatternMatch(target: ParsedTarget, pattern: string): number {
    const pIdx = pattern.indexOf('?');
    let cleanPattern = (pIdx >= 0 ? pattern.slice(0, pIdx) : pattern).replace(/\/+$/, '') || '/';
    const patternQuery = pIdx >= 0 ? pattern.slice(pIdx + 1) : '';

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

    if (patternQuery) {
      if (!this.matchesQueryParams(target.queryString, patternQuery)) {
        return 0;
      }
    }

    const queryBonus = patternQuery ? 0.25 : 0;

    if (cleanPattern === target.cleanPath || (target.querySubPath && cleanPattern === target.querySubPath)) {
      return 4 + queryBonus;
    }

    const normalizedPattern = cleanPattern.replace(/\{([a-zA-Z0-9_]+)\}/g, ':$1');
    const hasWildcard = normalizedPattern.includes('*');
    const hasParam = /:[a-zA-Z0-9_]+/.test(normalizedPattern);

    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[a-zA-Z0-9_]+/g, '[^/]+')
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    if (regex.test(target.cleanPath) || (target.querySubPath && regex.test(target.querySubPath))) {
      if (hasWildcard && !hasParam) {
        return 2 + queryBonus;
      }
      if (hasParam) {
        return 3 + queryBonus;
      }
      return 4 + queryBonus;
    }

    if (cleanPattern !== '/' && cleanPattern.length > 1) {
      const stripped = regexPattern.replace(/^\\?\//, '');
      const suffixRegex = new RegExp(`(?:^|\\/)${stripped}$`, 'i');
      if (suffixRegex.test(target.cleanPath) || (target.querySubPath && suffixRegex.test(target.querySubPath))) {
        return 1 + queryBonus;
      }
    }

    return 0;
  }

  private matchesQueryParams(actualQuery: string, expectedQuery: string): boolean {
    if (!actualQuery) {
      return false;
    }
    const actualParams = new URLSearchParams(actualQuery);
    const expectedParams = new URLSearchParams(expectedQuery);
    for (const [k, v] of expectedParams.entries()) {
      if (v.startsWith(':')) {
        if (!actualParams.has(k)) return false;
      } else if (actualParams.get(k) !== v) {
        return false;
      }
    }
    return true;
  }
}
