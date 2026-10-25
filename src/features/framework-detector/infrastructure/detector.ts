import type {
  FrameworkType,
  NetworkClientType,
  ProjectStack,
  FrameworkConvention,
} from '../domain/types';

const FRAMEWORK_CONVENTIONS: Record<FrameworkType, FrameworkConvention> = {
  angular: {
    servicePatterns: [
      '**/*.service.ts',
      '**/services/**/*.ts',
      'apps/**/src/**/*.ts',
      'libs/**/src/**/*.ts',
      'src/**/*.service.ts',
      'src/**/services/**/*.ts',
    ],
    modelPatterns: [
      '**/*.model.ts',
      '**/*.types.ts',
      '**/models/**/*.ts',
      'apps/**/src/**/*.model.ts',
      'libs/**/src/**/*.model.ts',
      'src/**/*.model.ts',
    ],
    endpointPatterns: [
      '**/*.service.ts',
      '**/services/**/*.ts',
      'apps/**/src/**/*.ts',
      'libs/**/src/**/*.ts',
      'src/**/*.service.ts',
    ],
    description: 'Angular enterprise application or Nx monorepo with dependency-injected services',
  },
  nextjs: {
    servicePatterns: ['lib/**/*.ts', 'services/**/*.ts', 'src/services/**/*.ts'],
    modelPatterns: ['types/**/*.ts', 'src/types/**/*.ts', 'models/**/*.ts'],
    endpointPatterns: ['app/api/**/route.ts', 'pages/api/**/*.ts', 'src/app/api/**/route.ts'],
    description: 'Next.js full-stack application with App Router or Pages API routes',
  },
  react: {
    servicePatterns: ['src/api/**/*.ts', 'src/services/**/*.ts', 'src/hooks/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts', 'src/models/**/*.ts'],
    endpointPatterns: ['src/api/**/*.ts', 'src/services/**/*.ts'],
    description: 'React SPA with hooks and client-side API modules',
  },
  vue: {
    servicePatterns: ['src/api/**/*.ts', 'src/composables/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/api/**/*.ts', 'src/composables/**/*.ts'],
    description: 'Vue 3 application with composables and API utilities',
  },
  nuxt: {
    servicePatterns: ['composables/**/*.ts', 'utils/**/*.ts'],
    modelPatterns: ['types/**/*.ts'],
    endpointPatterns: ['server/api/**/*.ts', 'server/routes/**/*.ts'],
    description: 'Nuxt 3 universal application with Nitro server routes',
  },
  svelte: {
    servicePatterns: ['src/lib/**/*.ts', 'src/services/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/routes/**/+server.ts'],
    description: 'Svelte / SvelteKit application with server endpoints',
  },
  three: {
    servicePatterns: ['src/loaders/**/*.ts', 'src/scenes/**/*.ts', 'src/api/**/*.ts', 'src/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts', 'src/models/**/*.ts'],
    endpointPatterns: ['src/**/*.ts', 'public/models/**'],
    description: 'Three.js 3D WebGL client with dynamic asset & API loading',
  },
  astro: {
    servicePatterns: ['src/pages/api/**/*.ts', 'src/services/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/pages/api/**/*.ts'],
    description: 'Astro content & hybrid web application',
  },
  remix: {
    servicePatterns: ['app/services/**/*.ts', 'app/models/**/*.ts'],
    modelPatterns: ['app/types/**/*.ts'],
    endpointPatterns: ['app/routes/**/*.tsx', 'app/routes/**/*.ts'],
    description: 'Remix full-stack application with loaders and actions',
  },
  solid: {
    servicePatterns: ['src/services/**/*.ts', 'src/api/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/routes/**/*.ts', 'src/api/**/*.ts'],
    description: 'Solid.js reactive SPA / SolidStart application',
  },
  qwik: {
    servicePatterns: ['src/services/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/routes/**/index.tsx'],
    description: 'Qwik resumable application',
  },
  ember: {
    servicePatterns: ['app/services/**/*.js', 'app/services/**/*.ts'],
    modelPatterns: ['app/models/**/*.js', 'app/models/**/*.ts'],
    endpointPatterns: ['app/adapters/**/*.js'],
    description: 'Ember.js application with adapters and services',
  },
  gatsby: {
    servicePatterns: ['src/services/**/*.ts', 'src/api/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/api/**/*.ts'],
    description: 'Gatsby static & serverless application',
  },
  vite: {
    servicePatterns: ['src/api/**/*.ts', 'src/services/**/*.ts', 'src/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/api/**/*.ts'],
    description: 'Vite fast development server SPA',
  },
  webpack: {
    servicePatterns: ['src/api/**/*.ts', 'src/services/**/*.ts'],
    modelPatterns: ['src/types/**/*.ts'],
    endpointPatterns: ['src/api/**/*.ts'],
    description: 'Webpack bundled application',
  },
  nestjs: {
    servicePatterns: ['src/**/*.service.ts'],
    modelPatterns: ['src/**/*.dto.ts', 'src/**/*.entity.ts', 'src/**/*.interface.ts'],
    endpointPatterns: ['src/**/*.controller.ts'],
    description: 'NestJS backend architecture with controllers and DTOs',
  },
  express: {
    servicePatterns: ['routes/**/*.ts', 'controllers/**/*.ts', 'src/routes/**/*.ts'],
    modelPatterns: ['models/**/*.ts', 'types/**/*.ts'],
    endpointPatterns: ['routes/**/*.ts', 'src/routes/**/*.ts'],
    description: 'Express.js microservice / API server',
  },
  vanilla: {
    servicePatterns: ['src/**/*.ts', 'lib/**/*.ts'],
    modelPatterns: ['types/**/*.ts', 'src/**/*.d.ts'],
    endpointPatterns: ['src/**/*.ts'],
    description: 'TypeScript / JavaScript application',
  },
};

const AUTH_KEYWORDS = ['auth', 'login', 'signin', 'token', 'session', 'user', 'oauth'];
const MFA_KEYWORDS = ['2fa', 'mfa', 'totp', 'verify', 'challenge', 'two-factor', 'twofactor', 'authenticator'];

export function detectProjectStack(
  packageJsonRaw?: string,
  workspaceFilePaths: string[] = []
): ProjectStack {
  let deps: Record<string, string> = {};
  let devDeps: Record<string, string> = {};

  if (packageJsonRaw) {
    try {
      const parsed = JSON.parse(packageJsonRaw);
      deps = parsed.dependencies || {};
      devDeps = parsed.devDependencies || {};
    } catch {
    }
  }

  const allDeps = { ...deps, ...devDeps };
  const detectedConfigFiles: string[] = [];

  for (const fp of workspaceFilePaths) {
    const base = fp.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';
    if (
      base === 'nx.json' ||
      base === 'project.json' ||
      base === 'angular.json' ||
      base.startsWith('next.config.') ||
      base.startsWith('nuxt.config.') ||
      base.startsWith('vite.config.') ||
      base.startsWith('svelte.config.') ||
      base === 'nest-cli.json' ||
      base.startsWith('tsconfig.')
    ) {
      detectedConfigFiles.push(base);
    }
  }

  let framework: FrameworkType = 'vanilla';
  let frameworkDisplayName = 'TypeScript / JavaScript';
  let frameworkVersion: string | undefined;

  const isNx =
    detectedConfigFiles.includes('nx.json') ||
    allDeps['@nx/angular'] !== undefined ||
    allDeps['@nrwl/angular'] !== undefined ||
    allDeps['nx'] !== undefined;

  if (allDeps['@angular/core'] || allDeps['@nx/angular'] || detectedConfigFiles.includes('angular.json') || (isNx && (detectedConfigFiles.includes('project.json') || allDeps['@angular/common']))) {
    framework = 'angular';
    frameworkDisplayName = isNx ? 'Nx Angular Monorepo' : 'Angular';
    frameworkVersion = (allDeps['@angular/core'] || allDeps['@nx/angular'] || allDeps['@nrwl/angular'])?.replace(/^[\^~]/, '');
  } else if (allDeps['next'] || detectedConfigFiles.some((f) => f.startsWith('next.config.'))) {
    framework = 'nextjs';
    frameworkDisplayName = 'Next.js';
    frameworkVersion = allDeps['next']?.replace(/^[\^~]/, '');
  } else if (allDeps['nuxt'] || detectedConfigFiles.some((f) => f.startsWith('nuxt.config.'))) {
    framework = 'nuxt';
    frameworkDisplayName = 'Nuxt';
    frameworkVersion = allDeps['nuxt']?.replace(/^[\^~]/, '');
  } else if (allDeps['vue'] || allDeps['@vue/runtime-core']) {
    framework = 'vue';
    frameworkDisplayName = 'Vue.js';
    frameworkVersion = allDeps['vue']?.replace(/^[\^~]/, '');
  } else if (allDeps['@sveltejs/kit'] || allDeps['svelte'] || detectedConfigFiles.some((f) => f.startsWith('svelte.config.'))) {
    framework = 'svelte';
    frameworkDisplayName = 'SvelteKit';
    frameworkVersion = (allDeps['@sveltejs/kit'] || allDeps['svelte'])?.replace(/^[\^~]/, '');
  } else if (allDeps['@nestjs/core'] || detectedConfigFiles.includes('nest-cli.json')) {
    framework = 'nestjs';
    frameworkDisplayName = 'NestJS';
    frameworkVersion = allDeps['@nestjs/core']?.replace(/^[\^~]/, '');
  } else if (allDeps['react'] || allDeps['react-dom']) {
    framework = 'react';
    frameworkDisplayName = 'React';
    frameworkVersion = allDeps['react']?.replace(/^[\^~]/, '');
  } else if (allDeps['three'] || allDeps['@types/three'] || allDeps['@react-three/fiber']) {
    framework = 'three';
    frameworkDisplayName = 'Three.js';
    frameworkVersion = (allDeps['three'] || allDeps['@types/three'])?.replace(/^[\^~]/, '');
  } else if (allDeps['astro'] || detectedConfigFiles.some((f) => f.startsWith('astro.config.'))) {
    framework = 'astro';
    frameworkDisplayName = 'Astro';
    frameworkVersion = allDeps['astro']?.replace(/^[\^~]/, '');
  } else if (allDeps['@remix-run/react'] || allDeps['@remix-run/node']) {
    framework = 'remix';
    frameworkDisplayName = 'Remix';
    frameworkVersion = allDeps['@remix-run/react']?.replace(/^[\^~]/, '');
  } else if (allDeps['solid-js'] || allDeps['solid-start']) {
    framework = 'solid';
    frameworkDisplayName = 'Solid.js';
    frameworkVersion = (allDeps['solid-start'] || allDeps['solid-js'])?.replace(/^[\^~]/, '');
  } else if (allDeps['@builder.io/qwik']) {
    framework = 'qwik';
    frameworkDisplayName = 'Qwik';
    frameworkVersion = allDeps['@builder.io/qwik']?.replace(/^[\^~]/, '');
  } else if (allDeps['ember-source'] || allDeps['ember-cli']) {
    framework = 'ember';
    frameworkDisplayName = 'Ember.js';
    frameworkVersion = allDeps['ember-source']?.replace(/^[\^~]/, '');
  } else if (allDeps['gatsby'] || detectedConfigFiles.some((f) => f.startsWith('gatsby-config.'))) {
    framework = 'gatsby';
    frameworkDisplayName = 'Gatsby';
    frameworkVersion = allDeps['gatsby']?.replace(/^[\^~]/, '');
  } else if (allDeps['vite'] || detectedConfigFiles.some((f) => f.startsWith('vite.config.'))) {
    framework = 'vite';
    frameworkDisplayName = 'Vite';
    frameworkVersion = allDeps['vite']?.replace(/^[\^~]/, '');
  } else if (allDeps['webpack'] || detectedConfigFiles.some((f) => f.startsWith('webpack.config.'))) {
    framework = 'webpack';
    frameworkDisplayName = 'Webpack';
    frameworkVersion = allDeps['webpack']?.replace(/^[\^~]/, '');
  } else if (allDeps['express']) {
    framework = 'express';
    frameworkDisplayName = 'Express.js';
    frameworkVersion = allDeps['express']?.replace(/^[\^~]/, '');
  }

  const networkClients: NetworkClientType[] = [];

  if (allDeps['@angular/common'] || framework === 'angular') {
    networkClients.push('angular-http');
  }
  if (allDeps['axios']) {
    networkClients.push('axios');
  }
  if (allDeps['ky']) {
    networkClients.push('ky');
  }
  if (allDeps['superagent']) {
    networkClients.push('superagent');
  }
  if (allDeps['got']) {
    networkClients.push('got');
  }
  if (allDeps['ofetch']) {
    networkClients.push('ofetch');
  }
  if (allDeps['wretch']) {
    networkClients.push('wretch');
  }
  if (framework === 'three' || allDeps['three']) {
    networkClients.push('three-loader');
  }
  if (allDeps['@tanstack/react-query'] || allDeps['@tanstack/vue-query'] || allDeps['@tanstack/svelte-query'] || allDeps['@tanstack/angular-query-experimental'] || allDeps['react-query']) {
    networkClients.push('tanstack-query');
  }
  if (allDeps['swr']) {
    networkClients.push('swr');
  }
  if (allDeps['@reduxjs/toolkit']) {
    networkClients.push('rtk-query');
  }
  if (networkClients.length === 0) {
    networkClients.push('fetch');
  }

  const primaryClient = networkClients[0] ?? 'fetch';

  const hasTypeScript =
    Boolean(allDeps['typescript']) ||
    detectedConfigFiles.some((f) => f.startsWith('tsconfig.')) ||
    workspaceFilePaths.some((p) => p.endsWith('.ts') || p.endsWith('.tsx'));

  const detectedKeywords: string[] = [];
  let hasAuthEndpoints = false;
  let has2faEndpoints = false;

  for (const fp of workspaceFilePaths) {
    const lower = fp.toLowerCase();
    for (const kw of AUTH_KEYWORDS) {
      if (lower.includes(kw) && !detectedKeywords.includes(kw)) {
        detectedKeywords.push(kw);
        hasAuthEndpoints = true;
      }
    }
    for (const kw of MFA_KEYWORDS) {
      if (lower.includes(kw) && !detectedKeywords.includes(kw)) {
        detectedKeywords.push(kw);
        has2faEndpoints = true;
      }
    }
  }

  return {
    framework,
    frameworkDisplayName,
    ...(frameworkVersion ? { frameworkVersion } : {}),
    networkClients,
    primaryClient,
    hasTypeScript,
    conventions: FRAMEWORK_CONVENTIONS[framework],
    detectedConfigFiles,
    authFeatures: {
      hasAuthEndpoints,
      has2faEndpoints,
      detectedKeywords,
    },
  };
}
