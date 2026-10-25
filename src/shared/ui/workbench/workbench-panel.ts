import * as vscode from 'vscode';
import {
  assertLoopbackHost,
  generateCspNonce,
  type DetectedApiCall,
  type MockRoute,
} from '../../kernel/index';
import { getWorkbenchStyles } from './workbench-styles';
import { getWorkbenchHtml } from './workbench-templates';
import { getWorkbenchClientScript } from './workbench-client';

export interface WorkbenchActions {
  onToggleProxy: () => Promise<void>;
  onToggleCdp: () => Promise<void>;
  onConnectProject?: () => Promise<void>;
  onDisconnectProject?: () => Promise<void>;
  onSaveRoute: (route: MockRoute) => void;
  onDeleteRoute: (routeId: string) => void;
  onToggleRoute: (routeId: string) => void;
  onClearTraffic: () => void;
  onCopyText: (text: string, label: string) => void;
  onScanWorkspace: () => Promise<DetectedApiCall[]>;
  onMockDetectedCall: (call: DetectedApiCall) => Promise<void>;
  onMockAllCalls: (calls: DetectedApiCall[], force?: boolean) => Promise<void>;
  onOpenEndpointInBrowser: (url: string) => Promise<void>;
  onOpenSourceLocation?: (fileName: string, line: number, character?: number) => Promise<void>;
  onSwitchRouteScenario?: (routeId: string, scenario: string) => void;
  onToggleHybridSeeder?: () => Promise<void>;
}

export class WorkbenchPanel {
  public static currentPanel: WorkbenchPanel | undefined;
  public static readonly viewType = 'mockscope.workbench';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public get extensionUri(): vscode.Uri {
    return this._extensionUri;
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    getState: () => any,
    actions: WorkbenchActions
  ): WorkbenchPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (WorkbenchPanel.currentPanel) {
      WorkbenchPanel.currentPanel._panel.reveal(column);
      WorkbenchPanel.currentPanel.refresh();
      return WorkbenchPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      WorkbenchPanel.viewType,
      'MockScope',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'media'),
        ],
      }
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'mockscope-icon.svg');

    WorkbenchPanel.currentPanel = new WorkbenchPanel(panel, extensionUri, getState, actions);
    return WorkbenchPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly getState: () => any,
    private readonly actions: WorkbenchActions
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this.getHtmlForWebview(this._panel.webview);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'toggleProxy':
            await this.actions.onToggleProxy();
            break;
          case 'toggleCdp':
            await this.actions.onToggleCdp();
            break;
          case 'connectProject':
            await this.actions.onConnectProject?.();
            this.refresh();
            break;
          case 'disconnectProject':
            await this.actions.onDisconnectProject?.();
            this.refresh();
            break;
          case 'toggleHybridSeeder':
            await this.actions.onToggleHybridSeeder?.();
            this.refresh();
            break;
          case 'saveRoute':
            this.actions.onSaveRoute(message.route);
            break;
          case 'deleteRoute':
            this.actions.onDeleteRoute(message.routeId);
            break;
          case 'toggleRoute':
            this.actions.onToggleRoute(message.routeId);
            break;
          case 'switchRouteScenario':
            this.actions.onSwitchRouteScenario?.(message.routeId, message.scenario);
            this.refresh();
            break;
          case 'clearTraffic':
            this.actions.onClearTraffic();
            break;
          case 'copyText':
            this.actions.onCopyText(message.text, message.label);
            break;
          case 'openEndpointInBrowser':
            await this.actions.onOpenEndpointInBrowser(message.url);
            break;
          case 'openSourceLocation':
            await this.actions.onOpenSourceLocation?.(
              message.fileName,
              message.line,
              message.character
            );
            break;
          case 'scanWorkspace': {
            this._panel.webview.postMessage({ type: 'scanStart' });
            try {
              const calls = await this.actions.onScanWorkspace();
              this.refresh();
              this._panel.webview.postMessage({ type: 'discoveredCalls', calls });
            } catch (err: any) {
              this._panel.webview.postMessage({
                type: 'scanError',
                error: err?.message || 'Failed to scan workspace',
              });
            }
            break;
          }
          case 'mockDetectedCall': {
            await this.actions.onMockDetectedCall(message.call);
            this.refresh();
            break;
          }
          case 'mockAllCalls': {
            await this.actions.onMockAllCalls(message.calls, message.force);
            this.refresh();
            break;
          }
          case 'ready':
            this.refresh();
            this._panel.webview.postMessage({ type: 'scanStart' });
            this.actions
              .onScanWorkspace()
              .then((calls) => {
                this.refresh();
                this._panel.webview.postMessage({ type: 'discoveredCalls', calls });
              })
              .catch((err: any) => {
                this._panel.webview.postMessage({
                  type: 'scanError',
                  error: err?.message || 'Failed to scan workspace',
                });
              });
            break;
        }
      },
      null,
      this._disposables
    );

    this.refresh();
  }

  public refresh(): void {
    if (!this._panel) return;
    const state = this.getState();
    this._panel.webview.postMessage({
      type: 'stateUpdate',
      ...state,
    });
  }

  public dispose(): void {
    WorkbenchPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = generateCspNonce();
    assertLoopbackHost('127.0.0.1');

    const css = getWorkbenchStyles();
    const clientScript = getWorkbenchClientScript(nonce);

    return getWorkbenchHtml(nonce, webview.cspSource, css, clientScript);
  }
}
