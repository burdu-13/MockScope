import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  autoConnectProject,
  disconnectProject,
  getProjectConnectionStatus,
  extractPrefixes,
  findEnvironmentFiles,
  patchAngularEnvironments,
  restoreAngularEnvironments,
} from '../index';

describe('project-connector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockscope-connector-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should auto-connect a Vite project by injecting server.proxy and restore on disconnect', () => {
    const viteConfig = path.join(tmpDir, 'vite.config.ts');
    fs.writeFileSync(
      viteConfig,
      `import { defineConfig } from 'vite';\nexport default defineConfig({\n  plugins: [],\n});\n`
    );

    const initialStatus = getProjectConnectionStatus(tmpDir, 45990);
    expect(initialStatus.isConnected).toBe(false);

    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('vite');

    const connectedStatus = getProjectConnectionStatus(tmpDir, 45990);
    expect(connectedStatus.isConnected).toBe(true);
    expect(connectedStatus.strategy).toBe('vite');

    const updatedContent = fs.readFileSync(viteConfig, 'utf-8');
    expect(updatedContent).toContain('127.0.0.1:45990');
    expect(updatedContent).toContain('/api');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);

    const postStatus = getProjectConnectionStatus(tmpDir, 45990);
    expect(postStatus.isConnected).toBe(false);
  });

  it('should auto-connect a Next.js project by injecting rewrites', () => {
    const nextConfig = path.join(tmpDir, 'next.config.js');
    fs.writeFileSync(nextConfig, `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  reactStrictMode: true,\n};\nmodule.exports = nextConfig;\n`);

    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('nextjs');

    const content = fs.readFileSync(nextConfig, 'utf-8');
    expect(content).toContain('rewrites()');
    expect(content).toContain('127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
  });

  it('should auto-connect an Angular project by creating proxy.conf.json', () => {
    const angularJson = path.join(tmpDir, 'angular.json');
    fs.writeFileSync(
      angularJson,
      JSON.stringify(
        {
          projects: {
            myApp: {
              architect: {
                serve: {
                  options: {},
                },
              },
            },
          },
        },
        null,
        2
      )
    );

    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('angular');

    const proxyConf = path.join(tmpDir, 'proxy.conf.json');
    expect(fs.existsSync(proxyConf)).toBe(true);
    const content = JSON.parse(fs.readFileSync(proxyConf, 'utf-8'));
    expect(content['/api'].target).toBe('http://127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
    expect(fs.existsSync(proxyConf)).toBe(false);
  });

  it('should auto-connect a Nuxt project by injecting Nitro routeRules', () => {
    const nuxtConfig = path.join(tmpDir, 'nuxt.config.ts');
    fs.writeFileSync(nuxtConfig, `export default defineNuxtConfig({\n  devtools: { enabled: true }\n});\n`);

    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('nuxt');

    const content = fs.readFileSync(nuxtConfig, 'utf-8');
    expect(content).toContain('routeRules');
    expect(content).toContain('127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
  });

  it('should auto-connect via package.json proxy for Create React App or Webpack', () => {
    const pkg = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkg, JSON.stringify({ name: 'my-cra-app', version: '1.0.0' }));

    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('package-proxy');

    const parsed = JSON.parse(fs.readFileSync(pkg, 'utf-8'));
    expect(parsed.proxy).toBe('http://127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
  });

  it('should fallback to universal .env.local for Three.js, Vanilla, Astro, Solid, etc.', () => {
    const connectRes = autoConnectProject(tmpDir, 45990);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('env');

    const envLocal = path.join(tmpDir, '.env.local');
    expect(fs.existsSync(envLocal)).toBe(true);
    const content = fs.readFileSync(envLocal, 'utf-8');
    expect(content).toContain('VITE_API_URL=http://127.0.0.1:45990');
    expect(content).toContain('NEXT_PUBLIC_API_URL=http://127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
  });

  it('should auto-connect an Nx Angular monorepo with apps/*/project.json', () => {
    const nxJson = path.join(tmpDir, 'nx.json');
    fs.writeFileSync(nxJson, JSON.stringify({ installation: { version: '19.0.0' } }));

    const appDir = path.join(tmpDir, 'apps', 'dashboard');
    fs.mkdirSync(appDir, { recursive: true });

    const projectJson = path.join(appDir, 'project.json');
    fs.writeFileSync(
      projectJson,
      JSON.stringify(
        {
          name: 'dashboard',
          targets: {
            serve: {
              executor: '@nx/angular:dev-server',
              options: { port: 4200 },
              configurations: {
                development: { buildTarget: 'dashboard:build:development' },
              },
            },
          },
        },
        null,
        2
      )
    );

    const connectRes = autoConnectProject(tmpDir, 45990, ['/api/stats', '/users']);
    expect(connectRes.success).toBe(true);
    expect(connectRes.strategy).toBe('angular');

    const appProxy = path.join(appDir, 'proxy.conf.json');
    expect(fs.existsSync(appProxy)).toBe(true);
    const content = JSON.parse(fs.readFileSync(appProxy, 'utf-8'));
    expect(content['/api'].target).toBe('http://127.0.0.1:45990');
    expect(content['/users'].target).toBe('http://127.0.0.1:45990');

    const updatedPJson = JSON.parse(fs.readFileSync(projectJson, 'utf-8'));
    expect(updatedPJson.targets.serve.options.proxyConfig).toBe('apps/dashboard/proxy.conf.json');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);
    expect(fs.existsSync(appProxy)).toBe(false);

    const restoredPJson = JSON.parse(fs.readFileSync(projectJson, 'utf-8'));
    expect(restoredPJson.targets.serve.options.proxyConfig).toBeUndefined();
  });

  it('should extract common API prefixes by default and from detected paths', () => {
    const prefixes = extractPrefixes(['https://api.example.com/auth/login', '/catalog/items/123']);
    expect(prefixes).toContain('/api');
    expect(prefixes).toContain('/auth');
    expect(prefixes).toContain('/catalog');
    expect(prefixes).toContain('/v1');
  });

  it('should discover, patch and restore Angular environment files with remote URLs', () => {
    const envDir = path.join(tmpDir, 'src', 'environments');
    fs.mkdirSync(envDir, { recursive: true });

    const devEnv = path.join(envDir, 'environment.development.ts');
    const originalContent = `export const environment = {\n  production: false,\n  apiUrl: 'https://api.example.com',\n};\n`;
    fs.writeFileSync(devEnv, originalContent, 'utf-8');

    const discovered = findEnvironmentFiles(tmpDir);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toBe(devEnv);

    const patched = patchAngularEnvironments(tmpDir, 'http://127.0.0.1:45990');
    expect(patched).toHaveLength(1);

    const patchedContent = fs.readFileSync(devEnv, 'utf-8');
    expect(patchedContent).toContain(`apiUrl: 'http://127.0.0.1:45990'`);
    expect(patchedContent).not.toContain('https://api.example.com');

    expect(fs.existsSync(`${devEnv}.mockscope.bak`)).toBe(true);

    const status = getProjectConnectionStatus(tmpDir, 45990);
    expect(status.isConnected).toBe(true);

    const restored = restoreAngularEnvironments(tmpDir);
    expect(restored).toHaveLength(1);
    expect(fs.existsSync(`${devEnv}.mockscope.bak`)).toBe(false);

    const restoredContent = fs.readFileSync(devEnv, 'utf-8');
    expect(restoredContent).toBe(originalContent);
  });

  it('should seamlessly patch environment and proxy.conf.json together on autoConnect and restore on disconnect', () => {
    const nxJson = path.join(tmpDir, 'nx.json');
    fs.writeFileSync(nxJson, JSON.stringify({}));

    const appDir = path.join(tmpDir, 'apps', 'web-app');
    const envDir = path.join(appDir, 'src', 'environments');
    fs.mkdirSync(envDir, { recursive: true });

    const envFile = path.join(envDir, 'environment.ts');
    fs.writeFileSync(
      envFile,
      `export const environment = {\n  apiUrl: 'https://api.example.com',\n};\n`
    );

    const projectJson = path.join(appDir, 'project.json');
    fs.writeFileSync(
      projectJson,
      JSON.stringify({ name: 'web-app', targets: { serve: { executor: '@nx/angular:dev-server', options: {} } } })
    );

    const connectRes = autoConnectProject(tmpDir, 45990, ['https://api.example.com/auth/login']);
    expect(connectRes.success).toBe(true);
    expect(connectRes.message).toContain('environment.ts');

    const patchedEnv = fs.readFileSync(envFile, 'utf-8');
    expect(patchedEnv).toContain(`apiUrl: 'http://127.0.0.1:45990'`);

    const appProxy = path.join(appDir, 'proxy.conf.json');
    expect(fs.existsSync(appProxy)).toBe(true);
    const proxyContent = JSON.parse(fs.readFileSync(appProxy, 'utf-8'));
    expect(proxyContent['/auth'].target).toBe('http://127.0.0.1:45990');
    expect(proxyContent['/api'].target).toBe('http://127.0.0.1:45990');

    const disconnectRes = disconnectProject(tmpDir);
    expect(disconnectRes.success).toBe(true);

    const restoredEnv = fs.readFileSync(envFile, 'utf-8');
    expect(restoredEnv).toContain(`apiUrl: 'https://api.example.com'`);
    expect(fs.existsSync(appProxy)).toBe(false);
  });
});
