import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import {
  globalEventBus,
  assertLoopbackHost,
  RouteTable,
  type DetectedApiCall,
  type MockRoute,
  type TrafficEntry,
} from '../shared/kernel/index';
import { generateMockVariants, datasetProvider, inspectTypeModel } from '../features/type-synthesizer/index';
import { RuntimeProxy, DEFAULT_PROXY_PORT } from '../features/runtime-proxy/index';
import { CdpBridgeController } from '../features/cdp-bridge/index';
import { generatePlaywrightSpec, generateMswHandler } from '../features/test-exporter/index';
import { ApiCodeLensProvider, ApiHoverProvider } from '../features/codelens-provider/index';
import {
  detectApiCalls,
  discoverOpenApiSchemas,
  schemaEndpointToApiCall,
} from '../features/ast-call-analyzer/index';
import { DashboardViewProvider, WorkbenchPanel } from '../shared/ui/index';
import { detectProjectStack, type ProjectStack } from '../features/framework-detector/index';
import {
  autoConnectProject,
  disconnectProject,
  getProjectConnectionStatus,
} from '../features/project-connector/index';

let runtimeProxy: RuntimeProxy | null = null;
let cdpBridge: CdpBridgeController | null = null;
let dashboardProvider: DashboardViewProvider | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let cachedProjectStack: ProjectStack | undefined;

const SUPPORTED_LANGUAGES = [
  'typescript',
  'typescriptreact',
  'javascript',
  'javascriptreact',
];

const SUPPORTED_DOC_SELECTORS: vscode.DocumentSelector = SUPPORTED_LANGUAGES.map((language) => ({
  scheme: 'file',
  language,
}));

const PLAYGROUND_TEMPLATE = `// MockScope Interactive Playground
// Hover over any API call or click the CodeLens above it to synthesize mocks, switch scenarios, or export tests.

export interface PlaygroundUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  isActive: boolean;
}

export interface PlaygroundOrder {
  id: string;
  totalCents: number;
  currency: 'USD' | 'EUR';
  status: 'pending' | 'paid' | 'shipped';
  createdAt: string;
}

export async function loadPlaygroundUsers(): Promise<PlaygroundUser[]> {
  const res = await fetch('/api/v1/users');
  return res.json();
}

export async function createPlaygroundOrder(order: Partial<PlaygroundOrder>) {
  return axios.post<PlaygroundOrder>('/api/v1/orders', order);
}

export function useOrderDetail(orderId: string) {
  return useQuery<PlaygroundOrder>({
    queryKey: [\`/api/v1/orders/\${orderId}\`],
    queryFn: () => fetch(\`/api/v1/orders/\${orderId}\`).then((r) => r.json()),
  });
}
`;

export function activate(context: vscode.ExtensionContext): void {
  const sharedRouteTable = new RouteTable();

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'mockscope.showQuickActions';
  statusBarItem.text = '$(radio-tower) MockScope';
  statusBarItem.tooltip = 'Click for MockScope Quick Control Hub';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const getRoutes = (): MockRoute[] => {
    return sharedRouteTable.getAll();
  };

  const codeLensProvider = new ApiCodeLensProvider(
    (text, fileName) => detectApiCalls(text, fileName),
    getRoutes
  );
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(SUPPORTED_DOC_SELECTORS, codeLensProvider)
  );
  context.subscriptions.push(codeLensProvider);

  const hoverProvider = new ApiHoverProvider(
    (text, fileName) => detectApiCalls(text, fileName),
    getRoutes,
    (call, sourceText) => {
      const variants = generateMockVariants(
        call.typeArgument || call.inferredShape,
        null,
        sourceText,
        call.fileName,
        call.url,
        call.responseConstraints
      );
      return variants.ok200.body;
    },
    (doc) => codeLensProvider.getCallsForDocument(doc)
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUPPORTED_DOC_SELECTORS, hoverProvider)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const doc = event.document;
      if (SUPPORTED_LANGUAGES.includes(doc.languageId)) {
        codeLensProvider.triggerDebouncedRefresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('mockscope.enableCodeLens') ||
        event.affectsConfiguration('mockscope.codeLensMode')
      ) {
        codeLensProvider.triggerDebouncedRefresh();
      }
    })
  );

  const getConfiguredProxyPort = (): number => {
    return vscode.workspace.getConfiguration('mockscope').get<number>('proxyPort', DEFAULT_PROXY_PORT);
  };

  const getConfiguredCdpPort = (): number => {
    return vscode.workspace.getConfiguration('mockscope').get<number>('cdpPort', 9222);
  };

  const inferDefaultAppUrl = (): string => {
    const configured = vscode.workspace.getConfiguration('mockscope').get<string>('appUrl', '').trim();
    if (configured) {
      return configured;
    }
    const fw = cachedProjectStack?.framework;
    if (fw === 'vite' || fw === 'svelte') {
      return 'http://localhost:5173';
    }
    if (fw === 'nextjs' || fw === 'nuxt' || fw === 'react') {
      return 'http://localhost:3000';
    }
    return 'http://localhost:4200';
  };

  const getTraffic = (): TrafficEntry[] => {
    const proxyTraffic = runtimeProxy?.getTraffic() || [];
    const cdpTraffic = cdpBridge?.getTraffic() || [];
    if (cdpTraffic.length === 0) return proxyTraffic;
    if (proxyTraffic.length === 0) return cdpTraffic;
    const merged = new Map<string, TrafficEntry>();
    for (const item of proxyTraffic) merged.set(item.id, item);
    for (const item of cdpTraffic) merged.set(item.id, item);
    return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
  };

  const getProxyState = () => ({
    running: runtimeProxy?.isRunning ?? false,
    port: runtimeProxy?.port ?? getConfiguredProxyPort(),
  });

  const getCdpState = () => ({
    attached: cdpBridge?.isAttached ?? false,
    port: cdpBridge?.debugPort ?? getConfiguredCdpPort(),
  });

  let cachedDiscoveredCalls: DetectedApiCall[] = [];

  const scanWorkspaceApiCalls = async (): Promise<DetectedApiCall[]> => {
    try {
      let packageJsonRaw: string | undefined;
      try {
        const pkgFiles = await vscode.workspace.findFiles('package.json', '**/node_modules/**', 1);
        if (pkgFiles[0] && fs.existsSync(pkgFiles[0].fsPath)) {
          packageJsonRaw = fs.readFileSync(pkgFiles[0].fsPath, 'utf-8');
        }
      } catch {
      }

      const WORKSPACE_EXCLUDE_GLOB = '{**/node_modules/**,**/.nx/**,**/.angular/**,**/dist/**,**/build/**,**/coverage/**,**/tmp/**,**/.git/**,**/*.spec.ts,**/*.test.ts}';

      const wsFiles = await vscode.workspace.findFiles(
        '{package.json,nx.json,angular.json,project.json,**/project.json,vite.config.*,next.config.*,nuxt.config.*,tsconfig.*}',
        WORKSPACE_EXCLUDE_GLOB,
        50
      );
      const filePaths = wsFiles.map((f) => f.fsPath);
      cachedProjectStack = detectProjectStack(packageJsonRaw, filePaths);

      const patternsToScan: string[] = [];
      if (cachedProjectStack.conventions?.servicePatterns) {
        patternsToScan.push(...cachedProjectStack.conventions.servicePatterns);
      }
      if (cachedProjectStack.conventions?.endpointPatterns) {
        patternsToScan.push(...cachedProjectStack.conventions.endpointPatterns);
      }
      patternsToScan.push('**/*.service.ts');
      patternsToScan.push('apps/**/src/**/*.{ts,js}');
      patternsToScan.push('libs/**/src/**/*.{ts,js}');
      patternsToScan.push('src/**/*.{ts,tsx,js,jsx}');

      const allCalls: DetectedApiCall[] = [];
      const seenCallIds = new Set<string>();
      const seenFilePaths = new Set<string>();

      for (const pattern of patternsToScan) {
        try {
          const matched = await vscode.workspace.findFiles(pattern, WORKSPACE_EXCLUDE_GLOB, 500);
          for (const file of matched) {
            const filePath = file.fsPath;
            if (seenFilePaths.has(filePath)) continue;
            seenFilePaths.add(filePath);

            try {
              if (!fs.existsSync(filePath)) continue;
              const stat = fs.statSync(filePath);
              if (stat.size > 512 * 1024) continue;

              const text = fs.readFileSync(filePath, 'utf-8');

              const hasNetworkKeyword =
                text.includes('http') ||
                text.includes('Http') ||
                text.includes('fetch') ||
                text.includes('axios') ||
                text.includes('ky') ||
                text.includes('Query') ||
                text.includes('load') ||
                text.includes('xhr') ||
                text.includes('api') ||
                text.includes('Api');

              if (!hasNetworkKeyword) continue;

              const calls = detectApiCalls(text, filePath);
              for (const c of calls) {
                const key = `${c.method}:${c.url}:${c.fileName}:${c.range.start.line}`;
                if (!seenCallIds.has(key)) {
                  seenCallIds.add(key);
                  allCalls.push(c);
                }
              }
            } catch {
            }
          }
        } catch {
        }
      }

      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (wsRoot) {
        datasetProvider.loadWorkspaceDataset(wsRoot);
        try {
          const schemaEndpoints = discoverOpenApiSchemas(wsRoot);
          for (const se of schemaEndpoints) {
            const apiCall = schemaEndpointToApiCall(se);
            const key = `${apiCall.method}:${apiCall.url}`;
            if (!seenCallIds.has(key)) {
              seenCallIds.add(key);
              allCalls.push(apiCall);
            }
          }
        } catch {
        }
      }

      cachedDiscoveredCalls = allCalls;
      if (runtimeProxy?.isRunning) {
        for (const call of allCalls) {
          if (!runtimeProxy.findRoute(call.method, call.url)) {
            const route = buildRouteForCall(call);
            runtimeProxy.addRoute(route);
          }
        }
      }
      return allCalls;
    } catch {
      return [];
    }
  };

  const buildRouteForCall = (call: DetectedApiCall, existing?: MockRoute): MockRoute => {
    let sourceText = '';
    if (call.fileName) {
      try {
        if (fs.existsSync(call.fileName)) {
          sourceText = fs.readFileSync(call.fileName, 'utf-8');
        }
      } catch {
      }
    }
    const effectiveType = call.typeArgument || call.inferredShape;
    const variants = generateMockVariants(
      effectiveType,
      null,
      sourceText,
      call.fileName,
      call.url,
      call.responseConstraints
    );
    const routeId = existing ? existing.id : `route_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const scenario = existing?.scenario || 'ok200';
    const activeVariant = variants[scenario] || variants.ok200;

    return {
      id: routeId,
      method: call.method,
      urlPattern: call.url,
      statusCode: activeVariant.statusCode,
      headers: activeVariant.headers,
      body: activeVariant.body,
      enabled: true,
      createdAt: existing ? existing.createdAt : Date.now(),
      source: 'synthesizer',
      scenario,
      variants,
    };
  };

  const stripTransientHeaders = (headers?: Record<string, string>): Record<string, string> => {
    const clean: Record<string, string> = {};
    const transientKeys = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);
    for (const [k, v] of Object.entries(headers || {})) {
      if (!transientKeys.has(k.toLowerCase())) {
        clean[k] = v;
      }
    }
    return clean;
  };

  const sanitizeRouteForDisk = (route: MockRoute): MockRoute => {
    let sanitizedVariants: MockRoute['variants'] | undefined;
    if (route.variants) {
      sanitizedVariants = {};
      for (const [k, variant] of Object.entries(route.variants)) {
        sanitizedVariants[k] = {
          ...variant,
          headers: stripTransientHeaders(variant.headers),
        };
      }
    }
    return {
      ...route,
      headers: stripTransientHeaders(route.headers),
      ...(sanitizedVariants ? { variants: sanitizedVariants } : {}),
    };
  };

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  context.subscriptions.push({
    dispose: () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
    },
  });

  const schedulePersistRoutes = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;
      try {
        const routes = getRoutes().map(sanitizeRouteForDisk);
        const dirPath = path.join(wsRoot, '.mockscope');
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(path.join(dirPath, 'routes.json'), JSON.stringify(routes, null, 2), 'utf-8');
      } catch {
      }
    }, 250);
  };

  const restoreRoutesFromDisk = () => {
    if (sharedRouteTable.getAll().length > 0) return;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return;
    try {
      const filePath = path.join(wsRoot, '.mockscope', 'routes.json');
      if (!fs.existsSync(filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.id && item.method && item.urlPattern) {
            sharedRouteTable.set(item as MockRoute);
          }
        }
      }
    } catch {
    }
  };

  const ensureProxyInstance = (): RuntimeProxy => {
    if (!runtimeProxy) {
      runtimeProxy = new RuntimeProxy(getConfiguredProxyPort(), sharedRouteTable);
      restoreRoutesFromDisk();
      runtimeProxy.setJitRouteResolver((method, url) => {
        const cleanUrl = url.split('?')[0] || '/';
        const matchedCall = cachedDiscoveredCalls.find(
          (c) =>
            c.method.toUpperCase() === method.toUpperCase() &&
            (c.url === cleanUrl || cleanUrl.endsWith(c.url) || c.url.endsWith(cleanUrl))
        );
        if (matchedCall) {
          return buildRouteForCall(matchedCall);
        }
        const variants = generateMockVariants(undefined, null, undefined, undefined, cleanUrl);
        return {
          id: `route_jit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          method: method.toUpperCase() as any,
          urlPattern: cleanUrl,
          statusCode: variants.ok200.statusCode,
          headers: variants.ok200.headers,
          body: variants.ok200.body,
          enabled: true,
          createdAt: Date.now(),
          source: 'synthesizer',
          scenario: 'ok200',
          variants,
        };
      });
    }
    return runtimeProxy;
  };

  const autoMockCall = async (
    call: DetectedApiCall,
    promptConnect = false,
    overwrite = true
  ) => {
    const proxy = ensureProxyInstance();
    if (!proxy.isRunning) {
      await proxy.start();
      updateStatusBar();
    }

    const existing = proxy.findRoute(call.method, call.url);
    if (existing && !overwrite) {
      return existing;
    }

    const route = buildRouteForCall(call, existing);
    proxy.addRoute(route);

    const isLoginEndpoint =
      call.method === 'POST' &&
      (call.url.includes('/login') || call.url.includes('/signin') || call.url.includes('/auth'));

    if (isLoginEndpoint && cachedDiscoveredCalls) {
      const relatedCalls = cachedDiscoveredCalls.filter(
        (c) =>
          c.id !== call.id &&
          (c.url.includes('/me') ||
            c.url.includes('/profile') ||
            c.url.includes('/current-user') ||
            c.url.includes('/currentuser') ||
            c.url.includes('/refresh') ||
            c.url.includes('/verify') ||
            c.url.includes('/mfa') ||
            c.url.includes('/otp'))
      );

      for (const rel of relatedCalls) {
        if (!proxy.findRoute(rel.method, rel.url)) {
          const relRoute = buildRouteForCall(rel);
          proxy.addRoute(relRoute);
        }
      }
    }

    codeLensProvider.triggerDebouncedRefresh();
    dashboardProvider?.refresh();
    WorkbenchPanel.currentPanel?.refresh();

    if (promptConnect) {
      const port = proxy.port || DEFAULT_PROXY_PORT;
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const status = wsRoot ? getProjectConnectionStatus(wsRoot, port) : { isConnected: false };
      if (!status.isConnected && wsRoot) {
        vscode.window
          .showInformationMessage(
            `MockScope: Mock active for ${call.method} ${call.url}. 1-Click Connect dev server so your browser app calls hit this mock?`,
            '1-Click Connect',
            'Later'
          )
          .then((choice) => {
            if (choice === '1-Click Connect') {
              vscode.commands.executeCommand('mockscope.connectProject');
            }
          });
      }
    }
    return route;
  };

  const switchRouteScenario = (routeId: string, scenario: string) => {
    const route = getRoutes().find((r) => r.id === routeId);
    if (route && route.variants && route.variants[scenario]) {
      const v = route.variants[scenario];
      route.scenario = scenario;
      route.statusCode = v.statusCode;
      route.headers = v.headers;
      route.body = v.body;
      route.delayMs = scenario === 'loading200' ? 2000 : route.delayMs === 2000 ? 0 : route.delayMs;
      sharedRouteTable.set(route);
      schedulePersistRoutes();
      codeLensProvider.triggerDebouncedRefresh();
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    }
  };

  const autoMockAllCalls = async (calls: DetectedApiCall[], forceRegenerate = false) => {
    const proxy = ensureProxyInstance();
    if (!proxy.isRunning) {
      await proxy.start();
      updateStatusBar();
    }

    const existingRoutes = proxy.getRoutes();
    const unmockedCalls = calls.filter(
      (c) => !existingRoutes.some((r) => r.urlPattern === c.url && (r.method === c.method || r.method === '*'))
    );

    if (unmockedCalls.length === 0 && !forceRegenerate) {
      const choice = await vscode.window.showInformationMessage(
        `All ${calls.length} endpoints are already mocked. Do you want to regenerate all mock responses with fresh synthetic data?`,
        'Regenerate All',
        'Cancel'
      );
      if (choice === 'Regenerate All') {
        await autoMockAllCalls(calls, true);
      }
      return;
    }

    const targetCalls = forceRegenerate ? calls : unmockedCalls;
    for (const call of targetCalls) {
      await autoMockCall(call, false, true);
    }

    const port = proxy.port || DEFAULT_PROXY_PORT;
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const status = wsRoot ? getProjectConnectionStatus(wsRoot, port) : { isConnected: false };

    if (!status.isConnected && wsRoot) {
      vscode.window
        .showInformationMessage(
          `MockScope: ${forceRegenerate ? `Regenerated all ${calls.length}` : `Generated ${targetCalls.length} new`} mocks! Connect your project dev server with 1 click so requests hit these mocks automatically?`,
          '1-Click Connect',
          'Later'
        )
        .then((choice) => {
          if (choice === '1-Click Connect') {
            vscode.commands.executeCommand('mockscope.connectProject');
          }
        });
    } else {
      vscode.window.showInformationMessage(
        `MockScope: ${forceRegenerate ? `Regenerated all ${calls.length}` : `Generated ${targetCalls.length} new`} mocks. Loopback proxy is live at http://127.0.0.1:${port}.`
      );
    }
  };

  const openEndpointInBrowser = async (urlPattern: string) => {
    try {
      const proxy = ensureProxyInstance();
      if (!proxy.isRunning) {
        await proxy.start();
        updateStatusBar();
      }

      const port = proxy.port || DEFAULT_PROXY_PORT;

      let resolved = urlPattern.trim();
      if (!resolved.startsWith('/') && !resolved.startsWith('http://') && !resolved.startsWith('https://')) {
        resolved = '/' + resolved;
      }
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        try {
          const parsed = new URL(resolved);
          resolved = parsed.pathname + (parsed.search || '');
        } catch {
          resolved = '/' + resolved.replace(/^https?:\/\/[^/]+/, '');
        }
      }

      resolved = resolved.replace(/:([a-zA-Z0-9_]+)/g, (_match, paramName) => {
        const lower = paramName.toLowerCase();
        if (lower.includes('id')) return '1';
        if (lower.includes('type')) return 'all';
        if (lower.includes('slug')) return 'sample-slug';
        return 'sample';
      });

      resolved = resolved.replace(/\*/g, 'sample');

      const finalUrl = `http://127.0.0.1:${port}${resolved.startsWith('/') ? '' : '/'}${resolved}`;
      assertLoopbackHost('127.0.0.1');

      await vscode.env.openExternal(vscode.Uri.parse(finalUrl));
      vscode.window.showInformationMessage(`MockScope: Opened mock endpoint in browser: ${finalUrl}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to open endpoint in browser: ${err.message}`);
    }
  };

  const replayTrafficEntry = async (entry: TrafficEntry): Promise<void> => {
    const proxy = ensureProxyInstance();
    if (!proxy.isRunning) {
      await proxy.start();
      updateStatusBar();
    }
    const port = proxy.port || DEFAULT_PROXY_PORT;
    assertLoopbackHost('127.0.0.1');

    let targetPath = entry.url || '/';
    if (targetPath.startsWith('http://') || targetPath.startsWith('https://')) {
      try {
        const parsed = new URL(targetPath);
        targetPath = parsed.pathname + parsed.search;
      } catch {
      }
    }
    if (!targetPath.startsWith('/')) {
      targetPath = '/' + targetPath;
    }

    await new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(entry.requestHeaders || {})) {
        if (v !== '[REDACTED]' && k.toLowerCase() !== 'host' && k.toLowerCase() !== 'content-length') {
          headers[k] = v;
        }
      }
      if (entry.requestBody && !headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: targetPath,
          method: entry.method || 'GET',
          headers,
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        }
      );
      req.on('error', reject);
      if (entry.requestBody && entry.method !== 'GET' && entry.method !== 'HEAD') {
        req.write(entry.requestBody);
      }
      req.end();
    });
  };

  const resolveCallArgument = async (
    call?: DetectedApiCall,
    sourceText?: string
  ): Promise<{ call: DetectedApiCall; sourceText?: string } | undefined> => {
    if (call) {
      return sourceText !== undefined ? { call, sourceText } : { call };
    }
    const editor = vscode.window.activeTextEditor;
    if (editor && SUPPORTED_LANGUAGES.includes(editor.document.languageId)) {
      const text = editor.document.getText();
      const docCalls = codeLensProvider.getCallsForDocument(editor.document);
      if (docCalls.length > 0) {
        const cursorLine = editor.selection.active.line;
        const onLine = docCalls.find(
          (c) => cursorLine >= c.range.start.line && cursorLine <= c.range.end.line
        );
        if (onLine) {
          return { call: onLine, sourceText: text };
        }
        const pick = await vscode.window.showQuickPick(
          docCalls.map((c) => ({
            label: `${c.method} ${c.url}`,
            description: `${c.clientType}${c.typeArgument ? ` <${c.typeArgument}>` : ''} (Line ${c.range.start.line + 1})`,
            call: c,
          })),
          { placeHolder: 'Select an API call in the active editor' }
        );
        if (pick) {
          return { call: pick.call, sourceText: text };
        }
        return undefined;
      }
    }

    if (cachedDiscoveredCalls.length > 0) {
      const pick = await vscode.window.showQuickPick(
        cachedDiscoveredCalls.map((c) => ({
          label: `${c.method} ${c.url}`,
          description: `${c.clientType}${c.typeArgument ? ` <${c.typeArgument}>` : ''}`,
          call: c,
        })),
        { placeHolder: 'Select a discovered workspace API call' }
      );
      if (pick) {
        return { call: pick.call };
      }
    }

    vscode.window.showInformationMessage('MockScope: No API call found at cursor or in active editor.');
    return undefined;
  };

  const openWorkbench = () => {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const currentPort = runtimeProxy?.port || DEFAULT_PROXY_PORT;
    const initialConnection = wsRoot ? getProjectConnectionStatus(wsRoot, currentPort) : { isConnected: false };

    if (initialConnection.isConnected && !runtimeProxy?.isRunning) {
      void vscode.commands.executeCommand('mockscope.startProxy');
    } else if (cachedDiscoveredCalls.length === 0) {
      void scanWorkspaceApiCalls().then(() => {
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      });
    }

    WorkbenchPanel.createOrShow(
      context.extensionUri,
      () => {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const port = runtimeProxy?.port || DEFAULT_PROXY_PORT;
        const connectionStatus = wsRoot ? getProjectConnectionStatus(wsRoot, port) : { isConnected: false };
        return {
          proxy: getProxyState(),
          cdp: getCdpState(),
          routes: getRoutes(),
          traffic: getTraffic(),
          discoveredCalls: cachedDiscoveredCalls,
          projectStack: cachedProjectStack,
          projectConnection: connectionStatus,
          hybridSeeder: datasetProvider.getState(),
        };
      },
      {
        onToggleHybridSeeder: async () => {
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const current = datasetProvider.getState();
          if (current.enabled) {
            datasetProvider.disableHybridPublicApi();
            if (cachedDiscoveredCalls.length > 0 && runtimeProxy?.isRunning) {
              for (const call of cachedDiscoveredCalls) {
                const existing = runtimeProxy.findRoute(call.method, call.url);
                const route = buildRouteForCall(call, existing);
                runtimeProxy.addRoute(route);
              }
            }
            vscode.window.showInformationMessage(
              'MockScope: Switched to 100% Offline Built-In Seeder and refreshed active mock routes.'
            );
          } else {
            const state = await datasetProvider.enableHybridPublicApiWithFallback(wsRoot);
            if (cachedDiscoveredCalls.length > 0 && runtimeProxy?.isRunning) {
              for (const call of cachedDiscoveredCalls) {
                const existing = runtimeProxy.findRoute(call.method, call.url);
                const route = buildRouteForCall(call, existing);
                runtimeProxy.addRoute(route);
              }
            }
            if (state.status === 'synced') {
              vscode.window.showInformationMessage(
                `MockScope: Hybrid Public API Seeder enabled (${state.recordCount} live records synced & cached) and active mock routes refreshed!`
              );
            } else {
              vscode.window.showInformationMessage(
                'MockScope: Hybrid Seeder enabled (Public API unreachable—using cached/built-in offline dataset fallback).'
              );
            }
          }
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onToggleProxy: async () => {
          if (runtimeProxy?.isRunning) {
            await vscode.commands.executeCommand('mockscope.stopProxy');
          } else {
            await vscode.commands.executeCommand('mockscope.startProxy');
          }
        },
        onToggleCdp: async () => {
          if (cdpBridge?.isAttached) {
            await vscode.commands.executeCommand('mockscope.detachCdp');
          } else {
            await vscode.commands.executeCommand('mockscope.attachCdp');
          }
        },
        onConnectProject: async () => {
          await vscode.commands.executeCommand('mockscope.connectProject');
        },
        onDisconnectProject: async () => {
          await vscode.commands.executeCommand('mockscope.disconnectProject');
        },
        onSaveRoute: async (route: MockRoute) => {
          const proxy = ensureProxyInstance();
          if (!proxy.isRunning) {
            await proxy.start();
            updateStatusBar();
          }
          proxy.addRoute(route);
          const port = proxy.port || DEFAULT_PROXY_PORT;
          vscode.window.showInformationMessage(`Saved mock route for ${route.method} ${route.urlPattern} (Listening at http://127.0.0.1:${port})`);
          codeLensProvider.triggerDebouncedRefresh();
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onDeleteRoute: (routeId: string) => {
          if (runtimeProxy) {
            runtimeProxy.removeRoute(routeId);
          } else {
            sharedRouteTable.delete(routeId);
            schedulePersistRoutes();
          }
          vscode.window.showInformationMessage('Mock route deleted.');
          codeLensProvider.triggerDebouncedRefresh();
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onToggleRoute: (routeId: string) => {
          const route = getRoutes().find((r) => r.id === routeId);
          if (route) {
            route.enabled = !(route.enabled !== false);
            if (runtimeProxy) {
              runtimeProxy.addRoute(route);
            } else {
              sharedRouteTable.set(route);
              schedulePersistRoutes();
            }
            codeLensProvider.triggerDebouncedRefresh();
            dashboardProvider?.refresh();
            WorkbenchPanel.currentPanel?.refresh();
          }
        },
        onSwitchRouteScenario: switchRouteScenario,
        onClearTraffic: () => {
          runtimeProxy?.clearTraffic();
          cdpBridge?.clearTraffic();
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onReplayTraffic: async (entry: TrafficEntry) => {
          try {
            await replayTrafficEntry(entry);
          } catch (err: any) {
            vscode.window.showErrorMessage(`MockScope: Failed to replay request: ${err?.message || err}`);
          }
        },
        onInspectTypeModel: async (typeName: string, fileName?: string) => {
          const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          const resolvedPath =
            fileName && !path.isAbsolute(fileName) && wsRoot
              ? path.join(wsRoot, fileName)
              : fileName;
          let sourceText: string | undefined;
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            try {
              sourceText = fs.readFileSync(resolvedPath, 'utf-8');
            } catch {
            }
          }
          return inspectTypeModel(typeName, sourceText, resolvedPath);
        },
        onCopyText: async (text: string, label: string) => {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage(`MockScope: Copied ${label} to clipboard.`);
        },
        onOpenEndpointInBrowser: openEndpointInBrowser,
        onOpenSourceLocation: async (fileName: string, line: number, character = 0) => {
          try {
            const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const resolvedPath =
              path.isAbsolute(fileName) || !wsRoot ? fileName : path.join(wsRoot, fileName);
            if (!fs.existsSync(resolvedPath)) {
              vscode.window.showWarningMessage(`MockScope: File not found: ${fileName}`);
              return;
            }
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath));
            const pos = new vscode.Position(Math.max(0, line), Math.max(0, character));
            await vscode.window.showTextDocument(doc, {
              selection: new vscode.Range(pos, pos),
              preview: true,
            });
          } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to open file: ${err?.message || fileName}`);
          }
        },
        onScanWorkspace: scanWorkspaceApiCalls,
        onMockDetectedCall: async (call) => {
          await autoMockCall(call, true);
        },
        onMockAllCalls: autoMockAllCalls,
      }
    );
  };

  dashboardProvider = new DashboardViewProvider(
    context.extensionUri,
    getProxyState,
    getCdpState,
    getRoutes,
    getTraffic,
    (routeId) => {
      const current = getRoutes().find((r) => r.id === routeId);
      if (current) {
        current.enabled = !(current.enabled !== false);
        if (runtimeProxy) {
          runtimeProxy.addRoute(current);
        } else {
          sharedRouteTable.set(current);
          schedulePersistRoutes();
        }
        codeLensProvider.triggerDebouncedRefresh();
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      }
    },
    () => {
      runtimeProxy?.clearTraffic();
      cdpBridge?.clearTraffic();
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    },
    async () => {
      if (runtimeProxy?.isRunning) {
        await vscode.commands.executeCommand('mockscope.stopProxy');
      } else {
        await vscode.commands.executeCommand('mockscope.startProxy');
      }
    },
    async () => {
      if (cdpBridge?.isAttached) {
        await vscode.commands.executeCommand('mockscope.detachCdp');
      } else {
        await vscode.commands.executeCommand('mockscope.attachCdp');
      }
    },
    openWorkbench,
    openEndpointInBrowser,
    () => cachedProjectStack
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardViewProvider.viewType,
      dashboardProvider
    )
  );

  const updateStatusBar = () => {
    const isProxyOn = runtimeProxy?.isRunning;
    const isCdpOn = cdpBridge?.isAttached;
    const activeCount = getRoutes().filter((r) => r.enabled !== false).length;
    const countSuffix = activeCount > 0 ? ` · ${activeCount} active` : '';

    if (isProxyOn && isCdpOn) {
      statusBarItem!.text = `$(radio-tower) MockScope :${runtimeProxy?.port} + CDP${countSuffix}`;
      statusBarItem!.backgroundColor = undefined;
    } else if (isProxyOn) {
      statusBarItem!.text = `$(radio-tower) MockScope :${runtimeProxy?.port}${countSuffix}`;
      statusBarItem!.backgroundColor = undefined;
    } else if (isCdpOn) {
      statusBarItem!.text = `$(radio-tower) MockScope CDP${countSuffix}`;
      statusBarItem!.backgroundColor = undefined;
    } else {
      statusBarItem!.text = `$(radio-tower) MockScope${countSuffix}`;
      statusBarItem!.backgroundColor = undefined;
    }
    dashboardProvider?.refresh();
    WorkbenchPanel.currentPanel?.refresh();
  };

  context.subscriptions.push({
    dispose: globalEventBus.on('proxy:stateChanged', () => updateStatusBar()),
  });
  context.subscriptions.push({
    dispose: globalEventBus.on('cdp:stateChanged', () => updateStatusBar()),
  });
  context.subscriptions.push({
    dispose: globalEventBus.on('traffic:logged', () => {
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    }),
  });
  context.subscriptions.push({
    dispose: globalEventBus.on('route:upserted', () => {
      schedulePersistRoutes();
      updateStatusBar();
      codeLensProvider.triggerDebouncedRefresh();
    }),
  });
  context.subscriptions.push({
    dispose: globalEventBus.on('route:deleted', () => {
      schedulePersistRoutes();
      updateStatusBar();
      codeLensProvider.triggerDebouncedRefresh();
    }),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.showQuickActions', async () => {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const port = runtimeProxy?.port || getConfiguredProxyPort();
      const conn: { isConnected: boolean; strategy?: string | undefined } = wsRoot
        ? getProjectConnectionStatus(wsRoot, port)
        : { isConnected: false };
      const routes = getRoutes();

      const items: Array<vscode.QuickPickItem & { action: () => Promise<void> | void }> = [
        {
          label: '$(window) Open Workbench',
          description: `${routes.length} routes · ${getTraffic().length} traffic entries`,
          action: () => openWorkbench(),
        },
        {
          label: runtimeProxy?.isRunning
            ? `$(debug-stop) Stop Loopback Proxy (127.0.0.1:${port})`
            : `$(play) Start Loopback Proxy (127.0.0.1:${port})`,
          description: runtimeProxy?.isRunning ? 'Currently running' : 'Currently stopped',
          action: () =>
            vscode.commands.executeCommand(
              runtimeProxy?.isRunning ? 'mockscope.stopProxy' : 'mockscope.startProxy'
            ),
        },
        {
          label: conn.isConnected
            ? '$(plug) Disconnect Project Dev Server'
            : '$(zap) 1-Click Connect Project Dev Server',
          description: conn.isConnected ? `Connected (${conn.strategy})` : 'Vite / Next / Angular / Nuxt',
          action: () =>
            vscode.commands.executeCommand(
              conn.isConnected ? 'mockscope.disconnectProject' : 'mockscope.connectProject'
            ),
        },
        {
          label: cdpBridge?.isAttached
            ? `$(debug-disconnect) Detach Browser CDP (:${cdpBridge.debugPort})`
            : `$(globe) Attach Browser CDP (:${getConfiguredCdpPort()})`,
          description: 'Zero-config wire-level browser interception',
          action: () =>
            vscode.commands.executeCommand(
              cdpBridge?.isAttached ? 'mockscope.detachCdp' : 'mockscope.attachCdp'
            ),
        },
        {
          label: '$(beaker) Open Interactive Playground',
          description: 'Try AST discovery, Hover previews, and scenarios in a sample TS file',
          action: () => vscode.commands.executeCommand('mockscope.openPlayground'),
        },
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'MockScope Control Hub',
      });
      if (picked) {
        await picked.action();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openPlayground', async () => {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (wsRoot) {
        const dirPath = path.join(wsRoot, '.mockscope');
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        const playgroundPath = path.join(dirPath, 'playground.ts');
        if (!fs.existsSync(playgroundPath)) {
          fs.writeFileSync(playgroundPath, PLAYGROUND_TEMPLATE, 'utf-8');
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(playgroundPath));
        await vscode.window.showTextDocument(doc);
      } else {
        const doc = await vscode.workspace.openTextDocument({
          language: 'typescript',
          content: PLAYGROUND_TEMPLATE,
        });
        await vscode.window.showTextDocument(doc);
      }
      codeLensProvider.triggerDebouncedRefresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.startProxy', async () => {
      try {
        const proxy = ensureProxyInstance();
        await proxy.start();
        if (cachedDiscoveredCalls.length === 0) {
          await scanWorkspaceApiCalls();
        } else {
          for (const call of cachedDiscoveredCalls) {
            if (!proxy.findRoute(call.method, call.url)) {
              const route = buildRouteForCall(call);
              proxy.addRoute(route);
            }
          }
        }
        vscode.window.showInformationMessage(
          `MockScope: Local mock proxy listening on 127.0.0.1:${proxy.port} (${proxy.getRoutes().length} endpoints active)`
        );
        updateStatusBar();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to start MockScope proxy: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.stopProxy', async () => {
      try {
        if (runtimeProxy) {
          await runtimeProxy.dispose();
          runtimeProxy = null;
          vscode.window.showInformationMessage('MockScope: Local mock proxy stopped.');
          updateStatusBar();
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to stop proxy: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.connectProject', async () => {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) {
        vscode.window.showWarningMessage('MockScope: No workspace folder open to connect.');
        return;
      }
      try {
        const proxy = ensureProxyInstance();
        if (!proxy.isRunning) {
          await proxy.start();
          updateStatusBar();
        }
        if (cachedDiscoveredCalls.length === 0) {
          await scanWorkspaceApiCalls();
        }
        for (const call of cachedDiscoveredCalls) {
          if (!proxy.findRoute(call.method, call.url)) {
            const route = buildRouteForCall(call);
            proxy.addRoute(route);
          }
        }
        const port = proxy.port || DEFAULT_PROXY_PORT;
        const routePaths = proxy.getRoutes().map((r) => r.urlPattern);
        const discoveredPaths = cachedDiscoveredCalls.map((c) => c.url);
        const paths = [...routePaths, ...discoveredPaths];
        const res = autoConnectProject(wsRoot, port, paths);
        vscode.window.showInformationMessage(`MockScope: ${res.message}. (Restart your dev server if it was already running to apply proxy).`);
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to connect project: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.disconnectProject', async () => {
      const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!wsRoot) return;
      try {
        const res = disconnectProject(wsRoot);
        vscode.window.showInformationMessage(`MockScope: ${res.message}`);
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to disconnect project: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.attachCdp',
      async (options?: { port?: number; targetUrl?: string; promptPort?: boolean }) => {
        let port = options?.port ?? getConfiguredCdpPort();

        if (options?.promptPort) {
          const portInput = await vscode.window.showInputBox({
            prompt: 'Enter Chrome/Edge debugging port (127.0.0.1)',
            value: String(port),
          });
          if (!portInput) return;

          port = parseInt(portInput, 10);
          if (isNaN(port)) {
            vscode.window.showErrorMessage('Invalid port number');
            return;
          }
        }

        const resolvedTargetUrl = options?.targetUrl || inferDefaultAppUrl();
        restoreRoutesFromDisk();

        try {
          if (!cdpBridge || cdpBridge.debugPort !== port) {
            cdpBridge = new CdpBridgeController(port, sharedRouteTable);
          }
          await cdpBridge.attach({ autoLaunch: false, targetUrl: resolvedTargetUrl });
          vscode.window.showInformationMessage(
            `MockScope: Browser CDP Bridge attached on port ${port}. HTTP requests in the browser will now be intercepted automatically.`
          );
          updateStatusBar();
          WorkbenchPanel.currentPanel?.refresh();
        } catch {
          const choice = await vscode.window.showInformationMessage(
            `MockScope: Debugging port ${port} is not open. Launch Chrome/Edge with debugging enabled (${resolvedTargetUrl}) without touching any proxy config?`,
            'Launch Browser with Debugging',
            'Cancel'
          );
          if (choice === 'Launch Browser with Debugging') {
            try {
              if (!cdpBridge || cdpBridge.debugPort !== port) {
                cdpBridge = new CdpBridgeController(port, sharedRouteTable);
              }
              await cdpBridge.attach({
                autoLaunch: true,
                targetUrl: resolvedTargetUrl,
              });
              vscode.window.showInformationMessage(
                `MockScope: Browser launched and CDP attached! All network requests will now be intercepted transparently.`
              );
              updateStatusBar();
              WorkbenchPanel.currentPanel?.refresh();
            } catch (launchErr: any) {
              vscode.window.showErrorMessage(`Failed to launch browser with debugging: ${launchErr.message}`);
            }
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.attachCdpCustom', async () => {
      await vscode.commands.executeCommand('mockscope.attachCdp', { promptPort: true });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.detachCdp', async () => {
      try {
        if (cdpBridge) {
          await cdpBridge.detach();
          cdpBridge = null;
          vscode.window.showInformationMessage('MockScope: Browser CDP Bridge detached.');
          updateStatusBar();
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to detach CDP bridge: ${err.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.callActions',
      async (rawCall?: DetectedApiCall, rawSourceText?: string, matchedRoute?: MockRoute) => {
        const resolved = await resolveCallArgument(rawCall, rawSourceText);
        if (!resolved) return;
        const { call, sourceText } = resolved;

        const items: Array<vscode.QuickPickItem & { run: () => Promise<void> }> = [
          {
            label: matchedRoute ? '$(sync) Switch Mock Scenario...' : '$(radio-tower) Synthesize Mock Route...',
            description: matchedRoute
              ? `Active: ${matchedRoute.statusCode} ${matchedRoute.scenario || 'custom'}`
              : `${call.method} ${call.url}`,
            run: async () => {
              await vscode.commands.executeCommand('mockscope.mockCall', call, sourceText);
            },
          },
          {
            label: '$(window) Open in Workbench',
            description: 'Inspect schema, edit JSON body, or view live traffic',
            run: async () => openWorkbench(),
          },
          {
            label: '$(globe) Preview Endpoint in Browser',
            description: `http://127.0.0.1:${runtimeProxy?.port || getConfiguredProxyPort()}${call.url}`,
            run: async () => openEndpointInBrowser(call.url),
          },
          {
            label: '$(copy) Copy Playwright Route Spec',
            description: 'Generates page.route() with parameter globs & delay',
            run: async () => {
              await vscode.commands.executeCommand('mockscope.copyPlaywrightSpec', call, sourceText);
            },
          },
          {
            label: '$(copy) Copy MSW v2 Handler',
            description: 'Generates http.<method>() + HttpResponse.json()',
            run: async () => {
              await vscode.commands.executeCommand('mockscope.copyMswHandler', call, sourceText);
            },
          },
        ];

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: `${call.method} ${call.url}${call.typeArgument ? ` <${call.typeArgument}>` : ''}`,
        });
        if (picked) {
          await picked.run();
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.mockCall',
      async (rawCall?: DetectedApiCall, rawSourceText?: string) => {
        const resolved = await resolveCallArgument(rawCall, rawSourceText);
        if (!resolved) return;
        const { call, sourceText } = resolved;

        const variants = generateMockVariants(
          call.typeArgument || call.inferredShape,
          null,
          sourceText,
          call.fileName,
          call.url,
          call.responseConstraints
        );

        const selection = await vscode.window.showQuickPick(
          [
            { label: '$(check) 200 Populated', description: 'Success state: Realistic payload matching TypeScript types', variant: variants.ok200, delayMs: 0, scenario: 'ok200' },
            { label: '$(sync~spin) 200 Loading State', description: 'Loading state: 2000ms delay to test frontend spinners/skeletons', variant: variants.ok200, delayMs: 2000, scenario: 'loading200' },
            { label: '$(inbox) 200 Empty State', description: 'Empty state: Zero-result array or collection', variant: variants.empty200, delayMs: 0, scenario: 'empty200' },
            { label: '$(shield) 200 2FA Challenge', description: 'Auth state: Two-factor TOTP verification challenge', variant: variants.mfa200, delayMs: 0, scenario: 'mfa200' },
            { label: '$(warning) 400 Bad Request', description: 'Error state: Client validation error', variant: variants.bad400, delayMs: 0, scenario: 'bad400' },
            { label: '$(lock) 401 Unauthorized', description: 'Error state: Expired or missing Bearer token', variant: variants.unauth401, delayMs: 0, scenario: 'unauth401' },
            { label: '$(circle-slash) 404 Not Found', description: 'Error state: Resource not found', variant: variants.notFound404, delayMs: 0, scenario: 'notFound404' },
            { label: '$(error) 500 Server Error', description: 'Error state: Upstream server failure', variant: variants.server500, delayMs: 0, scenario: 'server500' },
            { label: '$(dash) 204 No Content', description: 'Empty state: 204 No Content response', variant: variants.empty204, delayMs: 0, scenario: 'empty204' },
          ],
          { placeHolder: `Select mock state for ${call.method} ${call.url}` }
        );

        if (!selection) return;

        const proxy = ensureProxyInstance();
        const existing = proxy.findRoute(call.method, call.url);

        const route: MockRoute = {
          id: existing ? existing.id : `route_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          method: call.method,
          urlPattern: call.url,
          statusCode: selection.variant.statusCode,
          headers: selection.variant.headers,
          body: selection.variant.body,
          delayMs: selection.delayMs,
          variants,
          scenario: selection.scenario,
          enabled: true,
          createdAt: existing ? existing.createdAt : Date.now(),
          source: 'synthesizer',
        };

        if (!proxy.isRunning) {
          await proxy.start();
          updateStatusBar();
        }
        proxy.addRoute(route);

        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const port = proxy.port || DEFAULT_PROXY_PORT;
        const conn: { isConnected: boolean; strategy?: string | undefined } = wsRoot
        ? getProjectConnectionStatus(wsRoot, port)
        : { isConnected: false };
        if (!conn.isConnected && wsRoot) {
          vscode.window
            .showInformationMessage(
              `MockScope: Mock active for ${call.method} ${call.url}. Connect your dev server in 1 click so requests hit this mock?`,
              '1-Click Connect',
              'Dismiss'
            )
            .then((choice) => {
              if (choice === '1-Click Connect') {
                vscode.commands.executeCommand('mockscope.connectProject');
              }
            });
        } else {
          vscode.window.showInformationMessage(
            `MockScope: Mock registered for ${call.method} ${call.url} (${selection.variant.statusCode}${selection.delayMs ? ` with ${selection.delayMs}ms delay` : ''})`
          );
        }
        codeLensProvider.triggerDebouncedRefresh();
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyPlaywrightSpec',
      async (rawCall?: DetectedApiCall, rawSourceText?: string) => {
        const resolved = await resolveCallArgument(rawCall, rawSourceText);
        if (!resolved) return;
        const { call, sourceText } = resolved;

        const existing = sharedRouteTable.findExact(call.method, call.url);
        const mock = existing
          ? { statusCode: existing.statusCode, headers: existing.headers || {}, body: existing.body }
          : generateMockVariants(
              call.typeArgument || call.inferredShape,
              null,
              sourceText,
              call.fileName,
              call.url,
              call.responseConstraints
            ).ok200;
        const spec = generatePlaywrightSpec(call, mock, existing?.delayMs);
        await vscode.env.clipboard.writeText(spec);
        vscode.window.showInformationMessage('MockScope: Playwright route spec copied to clipboard.');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyMswHandler',
      async (rawCall?: DetectedApiCall, rawSourceText?: string) => {
        const resolved = await resolveCallArgument(rawCall, rawSourceText);
        if (!resolved) return;
        const { call, sourceText } = resolved;

        const existing = sharedRouteTable.findExact(call.method, call.url);
        const mock = existing
          ? { statusCode: existing.statusCode, headers: existing.headers || {}, body: existing.body }
          : generateMockVariants(
              call.typeArgument || call.inferredShape,
              null,
              sourceText,
              call.fileName,
              call.url,
              call.responseConstraints
            ).ok200;
        const handler = generateMswHandler(call, mock, existing?.delayMs);
        await vscode.env.clipboard.writeText(handler);
        vscode.window.showInformationMessage('MockScope: MSW v2 handler copied to clipboard.');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openWorkbench', openWorkbench)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openDashboard', openWorkbench)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openInBrowser', async (routeOrUrl?: MockRoute | string) => {
      let targetUrl = typeof routeOrUrl === 'string' ? routeOrUrl : routeOrUrl?.urlPattern;
      if (!targetUrl) {
        const routes = getRoutes();
        if (routes.length === 0) {
          vscode.window.showInformationMessage('MockScope: No mock routes configured yet. Create or discover routes first.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          routes.map((r) => ({
            label: `${r.method} ${r.urlPattern}`,
            description: `Status: ${r.statusCode} | Delay: ${r.delayMs || 0}ms`,
            route: r,
          })),
          { placeHolder: 'Select a mock endpoint to test live in your browser' }
        );
        if (!pick) return;
        targetUrl = pick.route.urlPattern;
      }
      await openEndpointInBrowser(targetUrl);
    })
  );

  updateStatusBar();
}

export async function deactivate(): Promise<void> {
  if (runtimeProxy) {
    await runtimeProxy.dispose();
    runtimeProxy = null;
  }
  if (cdpBridge) {
    await cdpBridge.detach();
    cdpBridge = null;
  }
}
