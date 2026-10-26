import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  globalEventBus,
  assertLoopbackHost,
  type DetectedApiCall,
  type MockRoute,
} from '../shared/kernel/index';
import { generateMockVariants, datasetProvider } from '../features/type-synthesizer/index';
import { RuntimeProxy, DEFAULT_PROXY_PORT } from '../features/runtime-proxy/index';
import { CdpBridgeController } from '../features/cdp-bridge/index';
import { generatePlaywrightSpec, generateMswHandler } from '../features/test-exporter/index';
import { ApiCodeLensProvider } from '../features/codelens-provider/index';
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

export function activate(context: vscode.ExtensionContext): void {

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'mockscope.openWorkbench';
  statusBarItem.text = '$(radio-tower) MockScope';
  statusBarItem.tooltip = 'Click to open MockScope';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const codeLensProvider = new ApiCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'javascriptreact' },
      ],
      codeLensProvider
    )
  );
  context.subscriptions.push(codeLensProvider);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const doc = event.document;
      if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(doc.languageId)) {
        codeLensProvider.triggerDebouncedRefresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mockscope.enableCodeLens')) {
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

  const getRoutes = (): MockRoute[] => {
    return runtimeProxy?.getRoutes() || cdpBridge?.getRoutes() || [];
  };

  const getTraffic = () => {
    return runtimeProxy?.getTraffic() || cdpBridge?.getTraffic() || [];
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
              if (stat.size > 512 * 1024) continue; // Skip files > 512KB

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
            if (cdpBridge) cdpBridge.addRoute(route);
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
        const routes = getRoutes().map((r) => ({
          ...r,
          headers: stripTransientHeaders(r.headers),
        }));
        const dirPath = path.join(wsRoot, '.mockscope');
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(path.join(dirPath, 'routes.json'), JSON.stringify(routes, null, 2), 'utf-8');
      } catch {
      }
    }, 250);
  };

  const restoreRoutesFromDisk = (proxy: RuntimeProxy) => {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return;
    try {
      const filePath = path.join(wsRoot, '.mockscope', 'routes.json');
      if (!fs.existsSync(filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.id && item.method && item.urlPattern) {
            proxy.addRoute(item as MockRoute);
            if (cdpBridge) {
              cdpBridge.addRoute(item as MockRoute);
            }
          }
        }
      }
    } catch {
    }
  };

  const ensureProxyInstance = (): RuntimeProxy => {
    if (!runtimeProxy) {
      runtimeProxy = new RuntimeProxy(getConfiguredProxyPort());
      restoreRoutesFromDisk(runtimeProxy);
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
    if (cdpBridge) {
      cdpBridge.addRoute(route);
    }

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
          if (cdpBridge) cdpBridge.addRoute(relRoute);
        }
      }
    }

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
      schedulePersistRoutes();
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
      if (!runtimeProxy || !runtimeProxy.isRunning) {
        if (!runtimeProxy) {
          runtimeProxy = new RuntimeProxy(getConfiguredProxyPort());
        }
        await runtimeProxy.start();
        updateStatusBar();
      }

      const port = runtimeProxy.port || DEFAULT_PROXY_PORT;

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
                if (cdpBridge) cdpBridge.addRoute(route);
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
                if (cdpBridge) cdpBridge.addRoute(route);
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
          if (!runtimeProxy) {
            runtimeProxy = new RuntimeProxy(getConfiguredProxyPort());
          }
          if (!runtimeProxy.isRunning) {
            await runtimeProxy.start();
            updateStatusBar();
          }
          runtimeProxy.addRoute(route);
          if (cdpBridge) {
            cdpBridge.addRoute(route);
          }
          const port = runtimeProxy.port || DEFAULT_PROXY_PORT;
          vscode.window.showInformationMessage(`Saved mock route for ${route.method} ${route.urlPattern} (Listening at http://127.0.0.1:${port})`);
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onDeleteRoute: (routeId: string) => {
          runtimeProxy?.removeRoute(routeId);
          cdpBridge?.removeRoute(routeId);
          vscode.window.showInformationMessage('Mock route deleted.');
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onToggleRoute: (routeId: string) => {
          const route = getRoutes().find((r) => r.id === routeId);
          if (route) {
            route.enabled = !(route.enabled !== false);
            if (runtimeProxy) runtimeProxy.addRoute(route);
            if (cdpBridge) cdpBridge.addRoute(route);
            schedulePersistRoutes();
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
        if (runtimeProxy) runtimeProxy.addRoute(current);
        if (cdpBridge) cdpBridge.addRoute(current);
        schedulePersistRoutes();
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

    if (isProxyOn && isCdpOn) {
      statusBarItem!.text = `$(radio-tower) MockScope: :${runtimeProxy?.port} + CDP`;
      statusBarItem!.backgroundColor = undefined;
    } else if (isProxyOn) {
      statusBarItem!.text = `$(radio-tower) MockScope: :${runtimeProxy?.port}`;
      statusBarItem!.backgroundColor = undefined;
    } else if (isCdpOn) {
      statusBarItem!.text = `$(radio-tower) MockScope: CDP`;
      statusBarItem!.backgroundColor = undefined;
    } else {
      statusBarItem!.text = `$(radio-tower) MockScope`;
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
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    }),
  });
  context.subscriptions.push({
    dispose: globalEventBus.on('route:deleted', () => {
      schedulePersistRoutes();
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    }),
  });

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
              if (cdpBridge) cdpBridge.addRoute(route);
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
            if (cdpBridge) cdpBridge.addRoute(route);
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

        try {
          if (!cdpBridge || cdpBridge.debugPort !== port) {
            cdpBridge = new CdpBridgeController(port);
          }
          await cdpBridge.attach({ autoLaunch: false, targetUrl: options?.targetUrl });
          vscode.window.showInformationMessage(
            `MockScope: Browser CDP Bridge attached on port ${port}. HTTP requests in the browser will now be intercepted automatically.`
          );
          updateStatusBar();
          WorkbenchPanel.currentPanel?.refresh();
        } catch (err: any) {
          const choice = await vscode.window.showInformationMessage(
            `MockScope: Debugging port ${port} is not open. Launch Chrome/Edge with debugging enabled so requests are intercepted automatically without touching any proxy config?`,
            'Launch Browser with Debugging',
            'Cancel'
          );
          if (choice === 'Launch Browser with Debugging') {
            try {
              if (!cdpBridge || cdpBridge.debugPort !== port) {
                cdpBridge = new CdpBridgeController(port);
              }
              await cdpBridge.attach({
                autoLaunch: true,
                targetUrl: options?.targetUrl || 'http://localhost:4200',
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
      'mockscope.mockCall',
      async (call: DetectedApiCall, sourceText?: string) => {
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
            { label: '$(warning) 400 Bad Request', description: 'Error state: Client validation error', variant: variants.bad400, delayMs: 0, scenario: 'bad400' },
            { label: '$(lock) 401 Unauthorized', description: 'Error state: Expired or missing Bearer token', variant: variants.unauth401, delayMs: 0, scenario: 'unauth401' },
            { label: '$(circle-slash) 404 Not Found', description: 'Error state: Resource not found', variant: variants.notFound404, delayMs: 0, scenario: 'notFound404' },
            { label: '$(error) 500 Server Error', description: 'Error state: Upstream server failure', variant: variants.server500, delayMs: 0, scenario: 'server500' },
            { label: '$(dash) 204 No Content', description: 'Empty state: 204 No Content response', variant: variants.empty204, delayMs: 0, scenario: 'empty204' },
          ],
          { placeHolder: `Select mock state for ${call.method} ${call.url}` }
        );

        if (!selection) return;

        const route: MockRoute = {
          id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          method: call.method,
          urlPattern: call.url,
          statusCode: selection.variant.statusCode,
          headers: selection.variant.headers,
          body: selection.variant.body,
          delayMs: selection.delayMs,
          variants,
          scenario: selection.scenario,
          enabled: true,
          createdAt: Date.now(),
          source: 'synthesizer',
        };

        const proxy = ensureProxyInstance();
        if (!proxy.isRunning) {
          await proxy.start();
          updateStatusBar();
        }
        proxy.addRoute(route);
        if (cdpBridge) {
          cdpBridge.addRoute(route);
        }

        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const port = proxy.port || DEFAULT_PROXY_PORT;
        const conn = wsRoot ? getProjectConnectionStatus(wsRoot, port) : { isConnected: false };
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
          if (wsRoot) {
            const routePaths = proxy.getRoutes().map((r) => r.urlPattern);
            const discoveredPaths = cachedDiscoveredCalls ? cachedDiscoveredCalls.map((c) => c.url) : [];
            autoConnectProject(wsRoot, port, [...routePaths, ...discoveredPaths]);
          }
          vscode.window.showInformationMessage(
            `MockScope: Mock registered for ${call.method} ${call.url} (${selection.variant.statusCode}${selection.delayMs ? ` with ${selection.delayMs}ms delay` : ''})`
          );
        }
        dashboardProvider?.refresh();
        WorkbenchPanel.currentPanel?.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyPlaywrightSpec',
      async (call: DetectedApiCall, sourceText?: string) => {
        const variants = generateMockVariants(
          call.typeArgument || call.inferredShape,
          null,
          sourceText,
          call.fileName,
          call.url,
          call.responseConstraints
        );
        const spec = generatePlaywrightSpec(call, variants.ok200);
        await vscode.env.clipboard.writeText(spec);
        vscode.window.showInformationMessage('MockScope: Playwright route spec copied to clipboard.');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyMswHandler',
      async (call: DetectedApiCall, sourceText?: string) => {
        const variants = generateMockVariants(
          call.typeArgument || call.inferredShape,
          null,
          sourceText,
          call.fileName,
          call.url,
          call.responseConstraints
        );
        const handler = generateMswHandler(call, variants.ok200);
        await vscode.env.clipboard.writeText(handler);
        vscode.window.showInformationMessage('MockScope: MSW v2 handler copied to clipboard.');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openWorkbench', openWorkbench),
    
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
