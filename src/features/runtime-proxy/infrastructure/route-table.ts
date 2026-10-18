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
    try {
      if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        const parsed = new URL(cleanPath);
        cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
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

    if (cleanPattern === cleanPath) {
      return true;
    }

    const regexPattern = cleanPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars except *
      .replace(/:[a-zA-Z0-9_]+/g, '[^/]+')   // Named parameters :id -> [^/]+
      .replace(/\*/g, '.*');                 // Wildcard * -> .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(cleanPath);
  }
}
