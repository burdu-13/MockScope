import * as vscode from 'vscode';
import {
  globalEventBus,
  type DetectedApiCall,
  type MockRoute,
} from '../shared/kernel/index';
import { generateMockVariants } from '../features/type-synthesizer/index';
import { RuntimeProxy, DEFAULT_PROXY_PORT } from '../features/runtime-proxy/index';
import { CdpBridgeController } from '../features/cdp-bridge/index';
import { generatePlaywrightSpec, generateMswHandler } from '../features/test-exporter/index';
import { ApiCodeLensProvider } from '../features/codelens-provider/index';
import { detectApiCalls } from '../features/ast-call-analyzer/index';
import { DashboardViewProvider, WorkbenchPanel } from '../shared/ui/index';

let runtimeProxy: RuntimeProxy | null = null;
let cdpBridge: CdpBridgeController | null = null;
let dashboardProvider: DashboardViewProvider | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;

export function activate(context: vscode.ExtensionContext): void {

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'mockscope.openWorkbench';
  statusBarItem.text = '$(radio-tower) MockScope Workbench';
  statusBarItem.tooltip = 'Click to open MockScope Workbench (Visual Workbench)';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const codeLensProvider = new ApiCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: 'typescript' },
        { language: 'typescriptreact' },
        { language: 'javascript' },
        { language: 'javascriptreact' },
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

  const getRoutes = (): MockRoute[] => {
    return runtimeProxy?.getRoutes() || cdpBridge?.getRoutes() || [];
  };

  const getTraffic = () => {
    return runtimeProxy?.getTraffic() || cdpBridge?.getTraffic() || [];
  };

  const getProxyState = () => ({
    running: runtimeProxy?.isRunning ?? false,
    port: runtimeProxy?.port ?? DEFAULT_PROXY_PORT,
  });

  const getCdpState = () => ({
    attached: cdpBridge?.isAttached ?? false,
    port: cdpBridge?.debugPort ?? 9222,
  });

  let cachedDiscoveredCalls: DetectedApiCall[] = [];

  const scanWorkspaceApiCalls = async (): Promise<DetectedApiCall[]> => {
    try {
      const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}', '**/node_modules/**', 100);
      const allCalls: DetectedApiCall[] = [];

      for (const file of files) {
        try {
          const doc = await vscode.workspace.openTextDocument(file);
          const calls = detectApiCalls(doc.getText(), file.fsPath);
          allCalls.push(...calls);
        } catch {
        }
      }

      cachedDiscoveredCalls = allCalls;
      return allCalls;
    } catch {
      return [];
    }
  };

  const autoMockCall = async (call: DetectedApiCall) => {
    let sourceText = '';
    if (call.fileName) {
      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(call.fileName));
        sourceText = doc.getText();
      } catch {
      }
    }
    const variants = generateMockVariants(call.typeArgument, null, sourceText);
    const route: MockRoute = {
      id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      method: call.method,
      urlPattern: call.url,
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: variants.ok200.body,
      enabled: true,
      createdAt: Date.now(),
      source: 'synthesizer',
    };

    if (!runtimeProxy) {
      runtimeProxy = new RuntimeProxy(DEFAULT_PROXY_PORT);
    }
    runtimeProxy.addRoute(route);
    if (cdpBridge) {
      cdpBridge.addRoute(route);
    }
    dashboardProvider?.refresh();
    WorkbenchPanel.currentPanel?.refresh();
  };

  const autoMockAllCalls = async (calls: DetectedApiCall[]) => {
    for (const call of calls) {
      await autoMockCall(call);
    }
    vscode.window.showInformationMessage(`⚡ MockScope: Auto-generated realistic mocks for all ${calls.length} endpoints!`);
  };

  const openWorkbench = () => {
    WorkbenchPanel.createOrShow(
      context.extensionUri,
      () => ({
        proxy: getProxyState(),
        cdp: getCdpState(),
        routes: getRoutes(),
        traffic: getTraffic(),
        discoveredCalls: cachedDiscoveredCalls,
      }),
      {
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
        onSaveRoute: (route: MockRoute) => {
          if (!runtimeProxy) {
            runtimeProxy = new RuntimeProxy(DEFAULT_PROXY_PORT);
          }
          runtimeProxy.addRoute(route);
          if (cdpBridge) {
            cdpBridge.addRoute(route);
          }
          vscode.window.showInformationMessage(`Saved mock route for ${route.method} ${route.urlPattern}`);
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
            route.enabled = !route.enabled;
            dashboardProvider?.refresh();
            WorkbenchPanel.currentPanel?.refresh();
          }
        },
        onClearTraffic: () => {
          runtimeProxy?.clearTraffic();
          cdpBridge?.clearTraffic();
          dashboardProvider?.refresh();
          WorkbenchPanel.currentPanel?.refresh();
        },
        onCopyText: async (text: string, label: string) => {
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage(`📋 Copied ${label} to clipboard!`);
        },
        onScanWorkspace: scanWorkspaceApiCalls,
        onMockDetectedCall: autoMockCall,
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
        current.enabled = !current.enabled;
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
    openWorkbench
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
      statusBarItem!.text = `$(radio-tower) MockScope: Workbench`;
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
      dashboardProvider?.refresh();
      WorkbenchPanel.currentPanel?.refresh();
    }),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.startProxy', async () => {
      try {
        if (!runtimeProxy) {
          runtimeProxy = new RuntimeProxy(DEFAULT_PROXY_PORT);
        }
        await runtimeProxy.start();
        vscode.window.showInformationMessage(
          `MockScope: Local mock proxy listening on 127.0.0.1:${runtimeProxy.port}`
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
    vscode.commands.registerCommand('mockscope.attachCdp', async () => {
      try {
        const portInput = await vscode.window.showInputBox({
          prompt: 'Enter Chrome/Edge debugging port (127.0.0.1)',
          value: '9222',
        });
        if (!portInput) return;

        const port = parseInt(portInput, 10);
        if (isNaN(port)) {
          vscode.window.showErrorMessage('Invalid port number');
          return;
        }

        cdpBridge = new CdpBridgeController(port);
        await cdpBridge.attach();
        vscode.window.showInformationMessage(`MockScope: CDP Bridge attached to browser on port ${port}.`);
        updateStatusBar();
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to attach CDP bridge: ${err.message}`);
      }
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
        const variants = generateMockVariants(call.typeArgument, null, sourceText);

        const selection = await vscode.window.showQuickPick(
          [
            { label: '⚡ 200 OK', description: 'Synthesized payload matching return type', variant: variants.ok200 },
            { label: '⚠️ 400 Bad Request', description: 'Simulate client validation error', variant: variants.bad400 },
            { label: '🔥 500 Server Error', description: 'Simulate upstream server failure', variant: variants.server500 },
            { label: '⚪ 204 No Content', description: 'Empty response body', variant: variants.empty204 },
          ],
          { placeHolder: `Select mock response for ${call.method} ${call.url}` }
        );

        if (!selection) return;

        const route: MockRoute = {
          id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          method: call.method,
          urlPattern: call.url,
          statusCode: selection.variant.statusCode,
          headers: selection.variant.headers,
          body: selection.variant.body,
          enabled: true,
          createdAt: Date.now(),
          source: 'synthesizer',
        };

        if (runtimeProxy) {
          runtimeProxy.addRoute(route);
        }
        if (cdpBridge) {
          cdpBridge.addRoute(route);
        }

        vscode.window.showInformationMessage(
          `MockScope: Mock route registered for ${call.method} ${call.url} (${selection.variant.statusCode})`
        );
        dashboardProvider?.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyPlaywrightSpec',
      async (call: DetectedApiCall, sourceText?: string) => {
        const variants = generateMockVariants(call.typeArgument, null, sourceText);
        const spec = generatePlaywrightSpec(call, variants.ok200);
        await vscode.env.clipboard.writeText(spec);
        vscode.window.showInformationMessage('📋 MockScope: Playwright route spec copied to clipboard!');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'mockscope.copyMswHandler',
      async (call: DetectedApiCall, sourceText?: string) => {
        const variants = generateMockVariants(call.typeArgument, null, sourceText);
        const handler = generateMswHandler(call, variants.ok200);
        await vscode.env.clipboard.writeText(handler);
        vscode.window.showInformationMessage('📋 MockScope: MSW v2 handler copied to clipboard!');
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openWorkbench', openWorkbench)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockscope.openDashboard', openWorkbench)
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
