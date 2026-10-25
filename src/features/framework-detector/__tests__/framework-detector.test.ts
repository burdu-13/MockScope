import { describe, it, expect } from 'vitest';
import { detectProjectStack } from '../index';

describe('framework-detector', () => {
  it('should detect Angular project from package.json and angular.json', () => {
    const pkg = JSON.stringify({
      dependencies: {
        '@angular/core': '^17.2.0',
        '@angular/common': '^17.2.0',
        rxjs: '~7.8.0',
      },
      devDependencies: {
        typescript: '~5.3.0',
      },
    });

    const files = [
      'angular.json',
      'tsconfig.json',
      'src/app/features/search/services/search-api-service.ts',
      'src/app/features/search/models/search.model.ts',
    ];

    const stack = detectProjectStack(pkg, files);
    expect(stack.framework).toBe('angular');
    expect(stack.frameworkDisplayName).toBe('Angular');
    expect(stack.frameworkVersion).toBe('17.2.0');
    expect(stack.networkClients).toContain('angular-http');
    expect(stack.hasTypeScript).toBe(true);
    expect(stack.conventions.servicePatterns).toContain('src/**/*.service.ts');
  });

  it('should detect Nx Angular monorepo from nx.json and @nx/angular', () => {
    const pkg = JSON.stringify({
      dependencies: {
        '@angular/core': '^18.0.0',
        '@angular/common': '^18.0.0',
      },
      devDependencies: {
        '@nx/angular': '^19.0.0',
        nx: '^19.0.0',
      },
    });

    const files = [
      'nx.json',
      'apps/my-app/project.json',
      'apps/my-app/src/app/my.service.ts',
      'libs/data-access/src/lib/api.service.ts',
    ];

    const stack = detectProjectStack(pkg, files);
    expect(stack.framework).toBe('angular');
    expect(stack.frameworkDisplayName).toBe('Nx Angular Monorepo');
    expect(stack.conventions.servicePatterns).toContain('apps/**/src/**/*.ts');
    expect(stack.conventions.servicePatterns).toContain('libs/**/src/**/*.ts');
  });

  it('should detect Next.js project with TanStack Query and Axios', () => {
    const pkg = JSON.stringify({
      dependencies: {
        next: '^14.1.0',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        axios: '^1.6.0',
        '@tanstack/react-query': '^5.20.0',
      },
    });

    const files = [
      'next.config.mjs',
      'tsconfig.json',
      'app/api/auth/login/route.ts',
      'app/api/auth/2fa/verify/route.ts',
    ];

    const stack = detectProjectStack(pkg, files);
    expect(stack.framework).toBe('nextjs');
    expect(stack.networkClients).toContain('axios');
    expect(stack.networkClients).toContain('tanstack-query');
    expect(stack.authFeatures.hasAuthEndpoints).toBe(true);
    expect(stack.authFeatures.has2faEndpoints).toBe(true);
    expect(stack.authFeatures.detectedKeywords).toContain('auth');
    expect(stack.authFeatures.detectedKeywords).toContain('2fa');
  });

  it('should detect NestJS project with DTO and controller conventions', () => {
    const pkg = JSON.stringify({
      dependencies: {
        '@nestjs/core': '^10.3.0',
        '@nestjs/common': '^10.3.0',
        rxjs: '^7.8.1',
      },
    });

    const files = ['nest-cli.json', 'src/auth/auth.controller.ts', 'src/auth/dto/login.dto.ts'];

    const stack = detectProjectStack(pkg, files);
    expect(stack.framework).toBe('nestjs');
    expect(stack.conventions.modelPatterns).toContain('src/**/*.dto.ts');
    expect(stack.authFeatures.hasAuthEndpoints).toBe(true);
  });

  it('should detect Vue/Nuxt and SvelteKit projects', () => {
    const nuxtPkg = JSON.stringify({ dependencies: { nuxt: '^3.10.0' } });
    const nuxtStack = detectProjectStack(nuxtPkg, ['nuxt.config.ts']);
    expect(nuxtStack.framework).toBe('nuxt');

    const sveltePkg = JSON.stringify({ dependencies: { '@sveltejs/kit': '^2.0.0' } });
    const svelteStack = detectProjectStack(sveltePkg, ['svelte.config.js']);
    expect(svelteStack.framework).toBe('svelte');

    const threePkg = JSON.stringify({ dependencies: { three: '^0.160.0', ky: '^1.2.0' } });
    const threeStack = detectProjectStack(threePkg, ['src/main.ts']);
    expect(threeStack.framework).toBe('three');
    expect(threeStack.networkClients).toContain('ky');
    expect(threeStack.networkClients).toContain('three-loader');

    const astroPkg = JSON.stringify({ dependencies: { astro: '^4.4.0', ofetch: '^1.3.0' } });
    const astroStack = detectProjectStack(astroPkg, ['astro.config.mjs']);
    expect(astroStack.framework).toBe('astro');
    expect(astroStack.networkClients).toContain('ofetch');

    const remixPkg = JSON.stringify({ dependencies: { '@remix-run/react': '^2.7.0' } });
    const remixStack = detectProjectStack(remixPkg, ['app/root.tsx']);
    expect(remixStack.framework).toBe('remix');

    const solidPkg = JSON.stringify({ dependencies: { 'solid-js': '^1.8.0', wretch: '^2.8.0' } });
    const solidStack = detectProjectStack(solidPkg, ['src/App.tsx']);
    expect(solidStack.framework).toBe('solid');
    expect(solidStack.networkClients).toContain('wretch');
  });

  it('should fallback gracefully to vanilla TypeScript with Fetch for empty or minimal manifests', () => {
    const stack = detectProjectStack('', ['src/index.ts']);
    expect(stack.framework).toBe('vanilla');
    expect(stack.primaryClient).toBe('fetch');
    expect(stack.hasTypeScript).toBe(true);
    expect(stack.authFeatures.hasAuthEndpoints).toBe(false);
  });
});
