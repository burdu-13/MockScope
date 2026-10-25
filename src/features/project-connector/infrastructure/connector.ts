import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ConnectionResult,
  DisconnectionResult,
  ProjectConnectionStatus,
} from '../domain/types';

const MOCK_MARKER = '/* __MOCKSCOPE_PROXY_AUTO_GENERATED__ */';

export function getProjectConnectionStatus(
  workspaceRoot: string,
  port = 45990
): ProjectConnectionStatus {
  const proxyUrl = `http://127.0.0.1:${port}`;

  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return { isConnected: false, proxyUrl };
  }

  const viteFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
  for (const f of viteFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes(String(port)) || content.includes(MOCK_MARKER)) {
        return { isConnected: true, strategy: 'vite', targetFile: f, proxyUrl };
      }
    }
  }

  const nextFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  for (const f of nextFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes(String(port)) || content.includes(MOCK_MARKER)) {
        return { isConnected: true, strategy: 'nextjs', targetFile: f, proxyUrl };
      }
    }
  }

  const angularProxy = path.join(workspaceRoot, 'proxy.conf.json');
  if (fs.existsSync(angularProxy)) {
    const content = fs.readFileSync(angularProxy, 'utf-8');
    if (content.includes(String(port))) {
      return { isConnected: true, strategy: 'angular', targetFile: 'proxy.conf.json', proxyUrl };
    }
  }

  const appsDir = path.join(workspaceRoot, 'apps');
  if (fs.existsSync(appsDir)) {
    try {
      const apps = fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      for (const app of apps) {
        const appProxy = path.join(appsDir, app, 'proxy.conf.json');
        if (fs.existsSync(appProxy)) {
          const content = fs.readFileSync(appProxy, 'utf-8');
          if (content.includes(String(port))) {
            return { isConnected: true, strategy: 'angular', targetFile: `apps/${app}/proxy.conf.json`, proxyUrl };
          }
        }
      }
    } catch {}
  }

  const envFiles = findEnvironmentFiles(workspaceRoot);
  for (const env of envFiles) {
    if (fs.existsSync(`${env}.mockscope.bak`)) {
      return { isConnected: true, strategy: 'angular', targetFile: path.relative(workspaceRoot, env), proxyUrl };
    }
  }

  const nuxtFiles = ['nuxt.config.ts', 'nuxt.config.js'];
  for (const f of nuxtFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf-8');
      if (content.includes(String(port)) || content.includes(MOCK_MARKER)) {
        return { isConnected: true, strategy: 'nuxt', targetFile: f, proxyUrl };
      }
    }
  }

  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.proxy && pkg.proxy.includes(String(port))) {
        return { isConnected: true, strategy: 'package-proxy', targetFile: 'package.json', proxyUrl };
      }
    } catch {}
  }

  const envLocalPath = path.join(workspaceRoot, '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf-8');
    if (content.includes(String(port))) {
      return { isConnected: true, strategy: 'env', targetFile: '.env.local', proxyUrl };
    }
  }

  return { isConnected: false, proxyUrl };
}

const SKIP_SCAN_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'out-tsc',
  'coverage',
  '.git',
  '.nx',
  '.angular',
  '.vscode',
  '.idea',
  'tmp',
  'temp',
]);

export function findEnvironmentFiles(dir: string, maxDepth = 5): string[] {
  const results: string[] = [];
  if (maxDepth <= 0 || !dir || !fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_SCAN_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
          results.push(...findEnvironmentFiles(path.join(dir, entry.name), maxDepth - 1));
        }
      } else if (entry.isFile()) {
        if (/^environment(\.[a-zA-Z0-9_-]+)?\.(ts|js)$/.test(entry.name)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  } catch {
  }
  return results;
}

export function patchAngularEnvironments(workspaceRoot: string, proxyTarget: string): string[] {
  const envFiles = findEnvironmentFiles(workspaceRoot);
  const patchedFiles: string[] = [];
  const remoteUrlRegex = /https?:\/\/(?!127\.0\.0\.1|localhost)[a-zA-Z0-9_.-]+(?::\d+)?/g;

  const nonProdFiles = envFiles.filter((f) => !f.includes('.prod.') && !f.includes('.production.'));
  const targets = nonProdFiles.length > 0 ? nonProdFiles : envFiles;

  for (const file of targets) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (remoteUrlRegex.test(content)) {
        remoteUrlRegex.lastIndex = 0;
        const backupFile = `${file}.mockscope.bak`;
        if (!fs.existsSync(backupFile)) {
          fs.writeFileSync(backupFile, content, 'utf-8');
        }
        const patched = content.replace(remoteUrlRegex, proxyTarget);
        fs.writeFileSync(file, patched, 'utf-8');
        patchedFiles.push(file);
      }
    } catch {
    }
  }

  return patchedFiles;
}

export function restoreAngularEnvironments(workspaceRoot: string): string[] {
  const envFiles = findEnvironmentFiles(workspaceRoot);
  const restoredFiles: string[] = [];

  for (const file of envFiles) {
    const backupFile = `${file}.mockscope.bak`;
    if (fs.existsSync(backupFile)) {
      try {
        const original = fs.readFileSync(backupFile, 'utf-8');
        fs.writeFileSync(file, original, 'utf-8');
        fs.unlinkSync(backupFile);
        restoredFiles.push(file);
      } catch {
      }
    }
  }

  return restoredFiles;
}

const STATIC_OR_INVALID_PREFIXES = new Set([
  '/i18n',
  '/locales',
  '/assets',
  '/public',
  '/static',
  '/images',
  '/icons',
  '/fonts',
  '/favicon.ico',
  '/base-url',
  '/api-url',
]);

export function extractPrefixes(paths: string[] = []): string[] {
  const set = new Set<string>();
  set.add('/api');
  set.add('/auth');
  set.add('/v1');
  set.add('/v2');
  set.add('/graphql');
  set.add('/rest');
  set.add('/oauth');
  for (const raw of paths) {
    if (!raw || typeof raw !== 'string') continue;
    let clean = raw.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      try {
        const u = new URL(clean);
        clean = u.pathname;
      } catch {
        clean = clean.replace(/^https?:\/\/[^/]+/, '');
      }
    }
    if (!clean.startsWith('/')) {
      clean = '/' + clean;
    }
    const match = clean.match(/^(\/[a-zA-Z0-9_-]+)/);
    if (match && match[1] && match[1] !== '/' && match[1] !== '/#') {
      const prefix = match[1];
      const lowerPrefix = prefix.toLowerCase();
      if (
        !STATIC_OR_INVALID_PREFIXES.has(lowerPrefix) &&
        !lowerPrefix.endsWith('-url') &&
        !lowerPrefix.endsWith('-endpoint')
      ) {
        set.add(prefix);
      }
    }
  }
  return Array.from(set);
}

export function autoConnectProject(
  workspaceRoot: string,
  port = 45990,
  detectedPaths: string[] = []
): ConnectionResult {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    throw new Error(`Workspace root directory not found: ${workspaceRoot}`);
  }

  const proxyTarget = `http://127.0.0.1:${port}`;
  const prefixes = extractPrefixes(detectedPaths);

  const viteFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
  for (const f of viteFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const original = fs.readFileSync(full, 'utf-8');
      if (original.includes(String(port))) {
        return {
          success: true,
          strategy: 'vite',
          targetFile: f,
          message: `Vite project already connected to MockScope at ${proxyTarget}`,
        };
      }

      const backupFile = `${full}.mockscope.bak`;
      if (!fs.existsSync(backupFile)) {
        fs.writeFileSync(backupFile, original, 'utf-8');
      }

      const proxyEntries = prefixes
        .map(
          (p) => `'${p}': {
        target: '${proxyTarget}',
        changeOrigin: true,
      }`
        )
        .join(',\n      ');

      const proxyBlock = `server: {
    proxy: {
      ${proxyEntries}
    },
  }, ${MOCK_MARKER}`;

      let modified = original;
      if (original.includes('defineConfig({')) {
        modified = original.replace('defineConfig({', `defineConfig({\n  ${proxyBlock}`);
      } else if (original.includes('export default {')) {
        modified = original.replace('export default {', `export default {\n  ${proxyBlock}`);
      } else {
        modified += `\n// MockScope Bridge\nexport const server = { proxy: { '/api': '${proxyTarget}' } };\n`;
      }

      fs.writeFileSync(full, modified, 'utf-8');
      return {
        success: true,
        strategy: 'vite',
        targetFile: f,
        backupFile: `${f}.mockscope.bak`,
        message: `Connected Vite (${f}) to MockScope at ${proxyTarget}`,
      };
    }
  }

  const nextFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  for (const f of nextFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const original = fs.readFileSync(full, 'utf-8');
      if (original.includes(String(port))) {
        return {
          success: true,
          strategy: 'nextjs',
          targetFile: f,
          message: `Next.js already connected to MockScope at ${proxyTarget}`,
        };
      }

      const backupFile = `${full}.mockscope.bak`;
      if (!fs.existsSync(backupFile)) {
        fs.writeFileSync(backupFile, original, 'utf-8');
      }

      const rewriteBlock = `async rewrites() {
    return [
      { source: '/api/:path*', destination: '${proxyTarget}/api/:path*' }
    ];
  }, ${MOCK_MARKER}`;

      let modified = original;
      if (original.includes('nextConfig = {')) {
        modified = original.replace('nextConfig = {', `nextConfig = {\n  ${rewriteBlock}`);
      } else if (original.includes('module.exports = {')) {
        modified = original.replace('module.exports = {', `module.exports = {\n  ${rewriteBlock}`);
      } else if (original.includes('export default {')) {
        modified = original.replace('export default {', `export default {\n  ${rewriteBlock}`);
      } else {
        modified += `\nmodule.exports = { ${rewriteBlock} };\n`;
      }

      fs.writeFileSync(full, modified, 'utf-8');
      return {
        success: true,
        strategy: 'nextjs',
        targetFile: f,
        backupFile: `${f}.mockscope.bak`,
        message: `Connected Next.js (${f}) to MockScope at ${proxyTarget}`,
      };
    }
  }

  const angularJsonPath = path.join(workspaceRoot, 'angular.json');
  if (fs.existsSync(angularJsonPath)) {
    const proxyConfPath = path.join(workspaceRoot, 'proxy.conf.json');
    const proxyConf: Record<string, any> = {};
    for (const prefix of prefixes) {
      proxyConf[prefix] = {
        target: proxyTarget,
        secure: false,
        changeOrigin: true,
      };
    }
    const proxyConfContent = JSON.stringify(proxyConf, null, 2);

    fs.writeFileSync(proxyConfPath, proxyConfContent, 'utf-8');

    try {
      const angularJsonRaw = fs.readFileSync(angularJsonPath, 'utf-8');
      const angularJson = JSON.parse(angularJsonRaw);
      const projects = angularJson.projects || {};
      const firstProjectKey = Object.keys(projects)[0];
      if (firstProjectKey && projects[firstProjectKey]?.architect?.serve) {
        const serve = projects[firstProjectKey].architect.serve;
        serve.options = serve.options || {};
        serve.options.proxyConfig = 'proxy.conf.json';
        if (serve.configurations?.development) {
          serve.configurations.development.proxyConfig = 'proxy.conf.json';
        }
        if (!fs.existsSync(`${angularJsonPath}.mockscope.bak`)) {
          fs.writeFileSync(`${angularJsonPath}.mockscope.bak`, angularJsonRaw, 'utf-8');
        }
        fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2), 'utf-8');
      }
    } catch {}

    const patchedEnvs = patchAngularEnvironments(workspaceRoot, proxyTarget);
    const envNote =
      patchedEnvs.length > 0
        ? ` & patched ${patchedEnvs.map((f) => path.basename(f)).join(', ')}`
        : '';

    return {
      success: true,
      strategy: 'angular',
      targetFile: 'proxy.conf.json',
      message: `Created Angular proxy.conf.json forwarding [${prefixes.join(', ')}] to ${proxyTarget}${envNote}`,
    };
  }

  const nxJsonPath = path.join(workspaceRoot, 'nx.json');
  const appsDir = path.join(workspaceRoot, 'apps');
  if (fs.existsSync(nxJsonPath) && fs.existsSync(appsDir)) {
    try {
      const apps = fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      let connectedAny = false;
      let lastTarget = '';

      const proxyConf: Record<string, any> = {};
      for (const prefix of prefixes) {
        proxyConf[prefix] = {
          target: proxyTarget,
          secure: false,
          changeOrigin: true,
        };
      }
      const proxyConfContent = JSON.stringify(proxyConf, null, 2);

      const rootProxyPath = path.join(workspaceRoot, 'proxy.conf.json');
      fs.writeFileSync(rootProxyPath, proxyConfContent, 'utf-8');

      for (const app of apps) {
        const appDir = path.join(appsDir, app);
        const projectJsonPath = path.join(appDir, 'project.json');
        const appProxyPath = path.join(appDir, 'proxy.conf.json');
        fs.writeFileSync(appProxyPath, proxyConfContent, 'utf-8');

        if (fs.existsSync(projectJsonPath)) {
          try {
            const raw = fs.readFileSync(projectJsonPath, 'utf-8');
            const pJson = JSON.parse(raw);
            if (pJson.targets?.serve) {
              const serve = pJson.targets.serve;
              serve.options = serve.options || {};
              serve.options.proxyConfig = `apps/${app}/proxy.conf.json`;
              if (serve.configurations?.development) {
                serve.configurations.development.proxyConfig = `apps/${app}/proxy.conf.json`;
              }
              const bak = `${projectJsonPath}.mockscope.bak`;
              if (!fs.existsSync(bak)) {
                fs.writeFileSync(bak, raw, 'utf-8');
              }
              fs.writeFileSync(projectJsonPath, JSON.stringify(pJson, null, 2), 'utf-8');
              connectedAny = true;
              lastTarget = `apps/${app}/project.json`;
            }
          } catch {}
        }
      }

      const patchedEnvs = patchAngularEnvironments(workspaceRoot, proxyTarget);
      const envNote =
        patchedEnvs.length > 0
          ? ` & patched ${patchedEnvs.map((f) => path.basename(f)).join(', ')}`
          : '';

      if (connectedAny || apps.length > 0) {
        return {
          success: true,
          strategy: 'angular',
          targetFile: lastTarget || 'proxy.conf.json',
          message: `Configured Nx Angular proxy for apps [${apps.join(', ')}] forwarding [${prefixes.join(', ')}] to ${proxyTarget}${envNote}`,
        };
      }
    } catch {}
  }

  const directProjectJsonPath = path.join(workspaceRoot, 'project.json');
  if (fs.existsSync(directProjectJsonPath)) {
    try {
      const proxyConf: Record<string, any> = {};
      for (const prefix of prefixes) {
        proxyConf[prefix] = {
          target: proxyTarget,
          secure: false,
          changeOrigin: true,
        };
      }
      const proxyConfContent = JSON.stringify(proxyConf, null, 2);
      const appProxyPath = path.join(workspaceRoot, 'proxy.conf.json');
      fs.writeFileSync(appProxyPath, proxyConfContent, 'utf-8');

      const raw = fs.readFileSync(directProjectJsonPath, 'utf-8');
      const pJson = JSON.parse(raw);
      if (pJson.targets?.serve) {
        const serve = pJson.targets.serve;
        serve.options = serve.options || {};
        if (!serve.options.proxyConfig) {
          serve.options.proxyConfig = 'proxy.conf.json';
        }
        if (serve.configurations?.development && !serve.configurations.development.proxyConfig) {
          serve.configurations.development.proxyConfig = serve.options.proxyConfig;
        }
        const bak = `${directProjectJsonPath}.mockscope.bak`;
        if (!fs.existsSync(bak)) {
          fs.writeFileSync(bak, raw, 'utf-8');
        }
        fs.writeFileSync(directProjectJsonPath, JSON.stringify(pJson, null, 2), 'utf-8');
      }

      const patchedEnvs = patchAngularEnvironments(workspaceRoot, proxyTarget);
      const envNote =
        patchedEnvs.length > 0
          ? ` & patched ${patchedEnvs.map((f) => path.basename(f)).join(', ')}`
          : '';

      return {
        success: true,
        strategy: 'angular',
        targetFile: 'proxy.conf.json',
        message: `Configured Nx project proxy.conf.json forwarding [${prefixes.join(', ')}] to ${proxyTarget}${envNote}`,
      };
    } catch {}
  }

  const nuxtFiles = ['nuxt.config.ts', 'nuxt.config.js'];
  for (const f of nuxtFiles) {
    const full = path.join(workspaceRoot, f);
    if (fs.existsSync(full)) {
      const original = fs.readFileSync(full, 'utf-8');
      if (original.includes(String(port))) {
        return {
          success: true,
          strategy: 'nuxt',
          targetFile: f,
          message: `Nuxt already connected to MockScope at ${proxyTarget}`,
        };
      }

      const backupFile = `${full}.mockscope.bak`;
      if (!fs.existsSync(backupFile)) {
        fs.writeFileSync(backupFile, original, 'utf-8');
      }

      const nitroBlock = `nitro: {
    routeRules: {
      '/api/**': { proxy: '${proxyTarget}/api/**' }
    }
  }, ${MOCK_MARKER}`;

      let modified = original;
      if (original.includes('defineNuxtConfig({')) {
        modified = original.replace('defineNuxtConfig({', `defineNuxtConfig({\n  ${nitroBlock}`);
      } else {
        modified += `\nexport default defineNuxtConfig({ ${nitroBlock} });\n`;
      }

      fs.writeFileSync(full, modified, 'utf-8');
      return {
        success: true,
        strategy: 'nuxt',
        targetFile: f,
        backupFile: `${f}.mockscope.bak`,
        message: `Connected Nuxt (${f}) to MockScope at ${proxyTarget}`,
      };
    }
  }

  const pkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgRaw);
      if (!pkg.proxy) {
        fs.writeFileSync(`${pkgPath}.mockscope.bak`, pkgRaw, 'utf-8');
        pkg.proxy = proxyTarget;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
        return {
          success: true,
          strategy: 'package-proxy',
          targetFile: 'package.json',
          backupFile: 'package.json.mockscope.bak',
          message: `Configured package.json proxy to ${proxyTarget}`,
        };
      }
    } catch {}
  }

  const envLocal = path.join(workspaceRoot, '.env.local');
  const envSnippet = `\n# MockScope Auto-Connect Proxy Bridge\nVITE_API_URL=${proxyTarget}\nNEXT_PUBLIC_API_URL=${proxyTarget}\nREACT_APP_API_URL=${proxyTarget}\nPUBLIC_API_URL=${proxyTarget}\nAPI_BASE_URL=${proxyTarget}\nVITE_API_BASE=${proxyTarget}\n${MOCK_MARKER}\n`;

  if (fs.existsSync(envLocal)) {
    const existing = fs.readFileSync(envLocal, 'utf-8');
    if (!existing.includes(String(port))) {
      fs.writeFileSync(envLocal, existing + envSnippet, 'utf-8');
    }
  } else {
    fs.writeFileSync(envLocal, envSnippet.trimStart(), 'utf-8');
  }

  return {
    success: true,
    strategy: 'env',
    targetFile: '.env.local',
    message: `Connected project via .env.local pointing API variables to ${proxyTarget}`,
  };
}

export function disconnectProject(workspaceRoot: string): DisconnectionResult {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    throw new Error(`Workspace root directory not found: ${workspaceRoot}`);
  }

  const restored: string[] = [];

  const restoredEnvs = restoreAngularEnvironments(workspaceRoot);
  for (const env of restoredEnvs) {
    restored.push(path.relative(workspaceRoot, env));
  }

  const candidates = [
    'vite.config.ts',
    'vite.config.js',
    'vite.config.mjs',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'nuxt.config.ts',
    'nuxt.config.js',
    'angular.json',
    'project.json',
    'package.json',
  ];

  for (const f of candidates) {
    const full = path.join(workspaceRoot, f);
    const backup = `${full}.mockscope.bak`;
    if (fs.existsSync(backup)) {
      const original = fs.readFileSync(backup, 'utf-8');
      fs.writeFileSync(full, original, 'utf-8');
      fs.unlinkSync(backup);
      restored.push(f);
      if (f === 'angular.json') {
        const angularProxy = path.join(workspaceRoot, 'proxy.conf.json');
        if (fs.existsSync(angularProxy)) {
          fs.unlinkSync(angularProxy);
          restored.push('proxy.conf.json');
        }
      }
    }
  }

  const appsDir = path.join(workspaceRoot, 'apps');
  if (fs.existsSync(appsDir)) {
    try {
      const apps = fs.readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
      for (const app of apps) {
        const appDir = path.join(appsDir, app);
        const projectJsonPath = path.join(appDir, 'project.json');
        const bak = `${projectJsonPath}.mockscope.bak`;
        if (fs.existsSync(bak)) {
          const original = fs.readFileSync(bak, 'utf-8');
          fs.writeFileSync(projectJsonPath, original, 'utf-8');
          fs.unlinkSync(bak);
          restored.push(`apps/${app}/project.json`);
        }
        const appProxy = path.join(appDir, 'proxy.conf.json');
        if (fs.existsSync(appProxy)) {
          fs.unlinkSync(appProxy);
          restored.push(`apps/${app}/proxy.conf.json`);
        }
      }
    } catch {}
  }

  const angularProxy = path.join(workspaceRoot, 'proxy.conf.json');
  if (fs.existsSync(angularProxy)) {
    fs.unlinkSync(angularProxy);
    restored.push('proxy.conf.json');
  }

  const envLocal = path.join(workspaceRoot, '.env.local');
  if (fs.existsSync(envLocal)) {
    let content = fs.readFileSync(envLocal, 'utf-8');
    if (content.includes('MockScope') || content.includes(MOCK_MARKER)) {
      content = content.replace(/# MockScope Auto-Connect Proxy Bridge[\s\S]*?\/\* __MOCKSCOPE_PROXY_AUTO_GENERATED__ \*\/\n?/g, '');
      content = content.replace(/VITE_API_URL=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      content = content.replace(/NEXT_PUBLIC_API_URL=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      content = content.replace(/REACT_APP_API_URL=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      content = content.replace(/PUBLIC_API_URL=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      content = content.replace(/API_BASE_URL=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      content = content.replace(/VITE_API_BASE=http:\/\/127\.0\.0\.1:\d+\n?/g, '');
      if (content.trim().length === 0) {
        fs.unlinkSync(envLocal);
      } else {
        fs.writeFileSync(envLocal, content.trim(), 'utf-8');
      }
      restored.push('.env.local');
    }
  }

  if (restored.length > 0) {
    const unique = Array.from(new Set(restored));
    return {
      success: true,
      restoredFile: unique.join(', '),
      message: `Restored original ${unique.join(', ')} and disconnected MockScope.`,
    };
  }

  return {
    success: true,
    restoredFile: 'None',
    message: 'Project was not modified or already disconnected.',
  };
}
