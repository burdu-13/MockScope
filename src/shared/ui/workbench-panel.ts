import * as vscode from 'vscode';
import {
  generateCspNonce,
  assertLoopbackHost,
  type MockRoute,
  type TrafficEntry,
  type DetectedApiCall,
} from '../kernel/index';

export class WorkbenchPanel {
  public static currentPanel: WorkbenchPanel | undefined;
  public static readonly viewType = 'mockscope.workbench';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    getState: () => {
      proxy: { running: boolean; port: number };
      cdp: { attached: boolean; port: number };
      routes: MockRoute[];
      traffic: TrafficEntry[];
      discoveredCalls: DetectedApiCall[];
    },
    actions: {
      onToggleProxy: () => Promise<void>;
      onToggleCdp: () => Promise<void>;
      onSaveRoute: (route: MockRoute) => void;
      onDeleteRoute: (routeId: string) => void;
      onToggleRoute: (routeId: string) => void;
      onClearTraffic: () => void;
      onCopyText: (text: string, label: string) => void;
      onScanWorkspace: () => Promise<DetectedApiCall[]>;
      onMockDetectedCall: (call: DetectedApiCall) => Promise<void>;
      onMockAllCalls: (calls: DetectedApiCall[]) => Promise<void>;
      onOpenEndpointInBrowser: (url: string) => Promise<void>;
    }
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
      'MockScope Workbench',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    WorkbenchPanel.currentPanel = new WorkbenchPanel(panel, getState, actions);
    return WorkbenchPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly getState: () => {
      proxy: { running: boolean; port: number };
      cdp: { attached: boolean; port: number };
      routes: MockRoute[];
      traffic: TrafficEntry[];
      discoveredCalls: DetectedApiCall[];
    },
    private readonly actions: {
      onToggleProxy: () => Promise<void>;
      onToggleCdp: () => Promise<void>;
      onSaveRoute: (route: MockRoute) => void;
      onDeleteRoute: (routeId: string) => void;
      onToggleRoute: (routeId: string) => void;
      onClearTraffic: () => void;
      onCopyText: (text: string, label: string) => void;
      onScanWorkspace: () => Promise<DetectedApiCall[]>;
      onMockDetectedCall: (call: DetectedApiCall) => Promise<void>;
      onMockAllCalls: (calls: DetectedApiCall[]) => Promise<void>;
      onOpenEndpointInBrowser: (url: string) => Promise<void>;
    }
  ) {
    this._panel = panel;

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
          case 'saveRoute':
            this.actions.onSaveRoute(message.route);
            break;
          case 'deleteRoute':
            this.actions.onDeleteRoute(message.routeId);
            break;
          case 'toggleRoute':
            this.actions.onToggleRoute(message.routeId);
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
          case 'scanWorkspace': {
            const calls = await this.actions.onScanWorkspace();
            this._panel.webview.postMessage({ type: 'discoveredCalls', calls });
            break;
          }
          case 'mockDetectedCall': {
            await this.actions.onMockDetectedCall(message.call);
            this.refresh();
            break;
          }
          case 'mockAllCalls': {
            await this.actions.onMockAllCalls(message.calls);
            this.refresh();
            break;
          }
          case 'ready':
            this.refresh();
            this.actions.onScanWorkspace().then((calls) => {
              this._panel.webview.postMessage({ type: 'discoveredCalls', calls });
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    img-src ${webview.cspSource} data:;
    connect-src ws://127.0.0.1:* http://127.0.0.1:*;
  ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MockScope Workbench</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --border: var(--vscode-widget-border, #3c3c3c);
      --panel-border: var(--vscode-panel-border, #333333);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --focus-border: var(--vscode-focusBorder, #007acc);
      --accent: #007acc;
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
      --muted: var(--vscode-descriptionForeground, #8c8c8c);
      --code-font: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 13px;
    }
    header {
      background: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
      letter-spacing: 0.3px;
    }
    .brand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }
    .brand-tag {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 10px;
      background: rgba(0, 122, 204, 0.15);
      color: #4fc1ff;
      border: 1px solid rgba(0, 122, 204, 0.3);
      letter-spacing: 0.5px;
    }
    .top-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .status-cluster {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg);
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      font-size: 11px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .status-dot.online {
      background-color: var(--success);
      box-shadow: 0 0 6px rgba(63, 185, 80, 0.6);
    }
    .status-dot.offline {
      background-color: #6e7681;
    }

    button {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid transparent;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      user-select: none;
    }
    button:hover { background: var(--btn-sec-hover); }
    button:focus-visible { outline: 1px solid var(--focus-border); outline-offset: 1px; }
    button.primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
      font-weight: 600;
    }
    button.primary:hover { background: var(--btn-hover); }
    button.accent {
      background: #238636;
      color: #ffffff;
      font-weight: 600;
    }
    button.accent:hover { background: #2ea043; }
    button.danger {
      background: transparent;
      border: 1px solid var(--danger);
      color: var(--danger);
    }
    button.danger:hover {
      background: rgba(248, 81, 73, 0.15);
    }
    button.btn-compact {
      padding: 3px 8px;
      font-size: 11px;
    }
    button.btn-success {
      background: rgba(63, 185, 80, 0.2) !important;
      color: var(--success) !important;
      border-color: var(--success) !important;
    }

    .workbench-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .left-pane {
      width: 440px;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      background: var(--bg);
    }
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--card-bg);
    }
    .tab {
      flex: 1;
      padding: 10px 8px;
      text-align: center;
      cursor: pointer;
      font-weight: 600;
      font-size: 11px;
      color: var(--muted);
      border-bottom: 2px solid transparent;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .tab:hover {
      color: var(--fg);
    }
    .tab.active {
      color: var(--fg);
      border-bottom-color: var(--accent);
      background: var(--bg);
    }
    .tab-count {
      background: rgba(255, 255, 255, 0.1);
      padding: 1px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      color: inherit;
    }
    .filter-bar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 8px;
      align-items: center;
      background: var(--bg);
    }
    input[type="text"], select, textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      transition: border-color 0.15s ease;
    }
    input[type="text"]:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--focus-border);
    }
    .search-input { flex: 1; }
    .item-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .list-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .list-card:hover {
      border-color: #666666;
    }
    .list-card.selected {
      border-color: var(--accent);
      background: rgba(0, 122, 204, 0.08);
      border-left: 3px solid var(--accent);
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .method-tag {
      font-weight: 700;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      text-transform: uppercase;
      font-family: var(--code-font);
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }
    .tag-get { background: #007acc; color: #ffffff; }
    .tag-post { background: #238636; color: #ffffff; }
    .tag-put { background: #b08800; color: #ffffff; }
    .tag-patch { background: #8957e5; color: #ffffff; }
    .tag-delete { background: #da3633; color: #ffffff; }
    .tag-other { background: #6e7681; color: #ffffff; }

    .path-text {
      font-family: var(--code-font);
      font-size: 12px;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #e6edf3;
    }
    .status-code-tag {
      font-weight: 700;
      font-size: 11px;
      font-family: var(--code-font);
      padding: 1px 6px;
      border-radius: 3px;
    }
    .status-2xx { color: var(--success); background: rgba(63, 185, 80, 0.1); border: 1px solid rgba(63, 185, 80, 0.3); }
    .status-3xx { color: #58a6ff; background: rgba(88, 166, 255, 0.1); border: 1px solid rgba(88, 166, 255, 0.3); }
    .status-4xx { color: var(--warning); background: rgba(210, 153, 34, 0.1); border: 1px solid rgba(210, 153, 34, 0.3); }
    .status-5xx { color: var(--danger); background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); }

    .card-sub {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
    }
    .type-tag {
      background: rgba(0, 122, 204, 0.15);
      color: #4fc1ff;
      border: 1px solid rgba(79, 193, 255, 0.25);
      padding: 1px 5px;
      border-radius: 3px;
      font-family: var(--code-font);
      font-size: 10px;
    }
    .mock-status-pill {
      font-size: 10px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .mock-status-pill.mocked { color: var(--success); }
    .mock-status-pill.pass { color: var(--muted); }

    .right-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--card-bg);
    }
    .inspector-header {
      padding: 12px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      gap: 12px;
      flex-shrink: 0;
    }
    .inspector-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .inspector-title span.path-display {
      font-family: var(--code-font);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inspector-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }
    .inspector-body {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-row {
      display: flex;
      gap: 12px;
    }
    .form-group label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .json-editor {
      font-family: var(--code-font);
      font-size: 12px;
      min-height: 240px;
      resize: vertical;
      line-height: 1.45;
      white-space: pre;
    }
    .empty-prompt {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: var(--muted);
      gap: 14px;
      padding: 30px;
      text-align: center;
    }
    .empty-icon-wrapper {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .feature-pills {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      max-width: 600px;
      text-align: left;
    }
    .feature-card {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 11px;
      line-height: 1.4;
    }
    .feature-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ffffff;
      font-size: 12px;
    }
    .tab-content-panel {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
      font-family: var(--code-font);
      font-size: 12px;
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.45;
    }
    .banner-bar {
      background: rgba(0, 122, 204, 0.1);
      border: 1px solid rgba(0, 122, 204, 0.25);
      padding: 10px 14px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .info-callout {
      background: rgba(0, 122, 204, 0.08);
      border: 1px solid rgba(0, 122, 204, 0.25);
      border-left: 3px solid var(--accent);
      padding: 12px 14px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
    }
    .section-headline {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--muted);
      margin: 4px 0;
    }
    @media (prefers-reduced-motion: reduce) {
        transition: none !important;
        animation: none !important;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="2"></circle>
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path>
        </svg>
      </div>
      <span>MockScope Workbench</span>
      <span class="brand-tag">Air-Gapped</span>
    </div>
    <div class="top-controls">
      <div class="status-cluster">
        <span id="proxyDot" class="status-dot offline"></span>
        <span>Proxy: <strong id="proxyText">OFF</strong></span>
        <button id="toggleProxyBtn" class="btn-compact" nonce="${nonce}">Start</button>
      </div>
      <div class="status-cluster">
        <span id="cdpDot" class="status-dot offline"></span>
        <span>CDP: <strong id="cdpText">Detached</strong></span>
        <button id="toggleCdpBtn" class="btn-compact" nonce="${nonce}">Attach</button>
      </div>
      <button id="scanBtn" nonce="${nonce}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Scan Workspace</span>
      </button>
      <button id="addMockBtn" class="primary" nonce="${nonce}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>New Mock Route</span>
      </button>
    </div>
  </header>

  <div class="workbench-layout">
    <div class="left-pane">
      <div class="tab-bar">
        <div id="tabDiscovered" class="tab active" nonce="${nonce}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span>Discovered APIs</span>
          <span id="discoveredCount" class="tab-count">0</span>
        </div>
        <div id="tabTraffic" class="tab" nonce="${nonce}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Live Traffic</span>
          <span id="trafficCount" class="tab-count">0</span>
        </div>
        <div id="tabRoutes" class="tab" nonce="${nonce}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span>Mock Routes</span>
          <span id="routeCount" class="tab-count">0</span>
        </div>
      </div>
      <div class="filter-bar">
        <input type="text" id="filterInput" class="search-input" placeholder="Filter endpoints..." nonce="${nonce}">
        <select id="methodFilter" nonce="${nonce}">
          <option value="ALL">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
        </select>
        <button id="clearBtn" class="btn-compact" nonce="${nonce}" title="Clear list or search">Clear</button>
      </div>
      <div id="itemList" class="item-list-container">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <div id="rightPane" class="right-pane">
      <!-- Rendered dynamically -->
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const ICONS = {
      search: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
      plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
      check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
      copy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      trash: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
      play: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
      square: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>',
      save: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
      radar: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"></circle><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"></path></svg>',
      layers: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
      activity: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
      wand: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 9-9"></path><path d="M12.2 6.2 11 5"></path><path d="M15 4V2"></path><path d="M15 16v-2"></path><path d="M8 9h2"></path><path d="M20 9h2"></path><path d="M17.8 11.8 19 13"></path><path d="M17.8 6.2 19 5"></path></svg>',
      code: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
      external: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
    };

    let state = {
      proxy: { running: false, port: 45990 },
      cdp: { attached: false, port: 9222 },
      routes: [],
      traffic: [],
      discoveredCalls: []
    };

    let activeTab = 'discovered'; // 'discovered' | 'traffic' | 'routes'
    let selectedId = null;
    let filterText = '';
    let filterMethod = 'ALL';

    const toggleProxyBtn = document.getElementById('toggleProxyBtn');
    const toggleCdpBtn = document.getElementById('toggleCdpBtn');
    const addMockBtn = document.getElementById('addMockBtn');
    const scanBtn = document.getElementById('scanBtn');
    const clearBtn = document.getElementById('clearBtn');
    const tabDiscovered = document.getElementById('tabDiscovered');
    const tabTraffic = document.getElementById('tabTraffic');
    const tabRoutes = document.getElementById('tabRoutes');
    const filterInput = document.getElementById('filterInput');
    const methodFilter = document.getElementById('methodFilter');
    const itemList = document.getElementById('itemList');
    const rightPane = document.getElementById('rightPane');

    tabDiscovered.addEventListener('click', () => {
      activeTab = 'discovered';
      tabDiscovered.classList.add('active');
      tabTraffic.classList.remove('active');
      tabRoutes.classList.remove('active');
      selectedId = null;
      render();
    });

    tabTraffic.addEventListener('click', () => {
      activeTab = 'traffic';
      tabTraffic.classList.add('active');
      tabDiscovered.classList.remove('active');
      tabRoutes.classList.remove('active');
      selectedId = null;
      render();
    });

    tabRoutes.addEventListener('click', () => {
      activeTab = 'routes';
      tabRoutes.classList.add('active');
      tabDiscovered.classList.remove('active');
      tabTraffic.classList.remove('active');
      selectedId = null;
      render();
    });

    toggleProxyBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleProxy' }));
    toggleCdpBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleCdp' }));
    scanBtn.addEventListener('click', () => vscode.postMessage({ type: 'scanWorkspace' }));
    clearBtn.addEventListener('click', () => {
      if (activeTab === 'traffic') {
        vscode.postMessage({ type: 'clearTraffic' });
      } else {
        filterInput.value = '';
        filterText = '';
        renderList();
      }
    });

    filterInput.addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      renderList();
    });

    methodFilter.addEventListener('change', (e) => {
      filterMethod = e.target.value;
      renderList();
    });

    addMockBtn.addEventListener('click', () => {
      activeTab = 'routes';
      tabRoutes.classList.add('active');
      tabDiscovered.classList.remove('active');
      tabTraffic.classList.remove('active');
      selectedId = 'NEW_ROUTE';
      render();
    });

    window.addEventListener('message', (event) => {
      if (event.data.type === 'stateUpdate') {
        state = { ...state, ...event.data };
        render();
      } else if (event.data.type === 'discoveredCalls') {
        state.discoveredCalls = event.data.calls || [];
        document.getElementById('discoveredCount').textContent = state.discoveredCalls.length;
        renderList();
      }
    });

    vscode.postMessage({ type: 'ready' });

    function copyWithFeedback(buttonElement, textToCopy, label) {
      if (!buttonElement) return;
      vscode.postMessage({ type: 'copyText', text: textToCopy, label });
      const originalHtml = buttonElement.innerHTML;
      buttonElement.innerHTML = ICONS.check + ' <span>Copied!</span>';
      buttonElement.classList.add('btn-success');
      setTimeout(() => {
        buttonElement.innerHTML = originalHtml;
        buttonElement.classList.remove('btn-success');
      }, 1800);
    }

    function render() {
      const proxyDot = document.getElementById('proxyDot');
      const proxyText = document.getElementById('proxyText');
      if (state.proxy.running) {
        proxyText.textContent = '127.0.0.1:' + state.proxy.port;
        proxyDot.className = 'status-dot online';
        toggleProxyBtn.textContent = 'Stop';
      } else {
        proxyText.textContent = 'OFF';
        proxyDot.className = 'status-dot offline';
        toggleProxyBtn.textContent = 'Start';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      if (state.cdp.attached) {
        cdpText.textContent = 'Port ' + state.cdp.port;
        cdpDot.className = 'status-dot online';
        toggleCdpBtn.textContent = 'Detach';
      } else {
        cdpText.textContent = 'Detached';
        cdpDot.className = 'status-dot offline';
        toggleCdpBtn.textContent = 'Attach';
      }

      document.getElementById('discoveredCount').textContent = (state.discoveredCalls || []).length;
      document.getElementById('trafficCount').textContent = state.traffic.length;
      document.getElementById('routeCount').textContent = state.routes.length;

      renderList();
      renderInspector();
    }

    function getMethodTagClass(method) {
      const m = (method || '').toLowerCase();
      if (m === 'get') return 'tag-get';
      if (m === 'post') return 'tag-post';
      if (m === 'put') return 'tag-put';
      if (m === 'patch') return 'tag-patch';
      if (m === 'delete') return 'tag-delete';
      return 'tag-other';
    }

    function getStatusClass(code) {
      if (code >= 200 && code < 300) return 'status-2xx';
      if (code >= 300 && code < 400) return 'status-3xx';
      if (code >= 400 && code < 500) return 'status-4xx';
      return 'status-5xx';
    }

    function renderList() {
      itemList.innerHTML = '';

      if (activeTab === 'discovered') {
        const calls = state.discoveredCalls || [];
        const filtered = calls.filter(c => {
          const matchUrl = c.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || c.method.toUpperCase() === filterMethod;
          return matchUrl && matchMethod;
        });

        if (calls.length > 0) {
          const banner = document.createElement('div');
          banner.className = 'banner-bar';
          banner.innerHTML = \`
            <span><strong>\${calls.length}</strong> API calls discovered in project</span>
            <button id="mockAllBtn" class="accent btn-compact" nonce="${nonce}">
              \${ICONS.wand}
              <span>Auto-Mock All</span>
            </button>
          \`;
          itemList.appendChild(banner);

          banner.querySelector('#mockAllBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'mockAllCalls', calls: state.discoveredCalls });
          });
        }

        if (filtered.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt';
          empty.style.padding = '30px 10px';
          empty.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.radar}</div>
            <strong style="color: #fff;">No API calls detected yet</strong>
            <span style="max-width: 280px; font-size: 11px;">MockScope automatically scans fetch, axios, and useQuery endpoints across your workspace.</span>
            <button id="emptyScanBtn" class="primary btn-compact" nonce="${nonce}" style="margin-top: 6px;">
              \${ICONS.search}
              <span>Scan Workspace</span>
            </button>
          \`;
          empty.querySelector('#emptyScanBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'scanWorkspace' });
          });
          itemList.appendChild(empty);
          return;
        }

        filtered.forEach(call => {
          const isAlreadyMocked = state.routes.some(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));
          const card = document.createElement('div');
          card.className = 'list-card' + (selectedId === call.id ? ' selected' : '');
          const filename = (call.fileName || '').split(/[\\\\/]/).pop() || '';

          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${call.method}</span>
              <span class="path-text" title="\${call.url}">\${call.url}</span>
              \${call.typeArgument ? \`<span class="type-tag" title="Generic return type">&lt;\${call.typeArgument}&gt;</span>\` : ''}
            </div>
            <div class="card-sub">
              <span>\${call.clientType} in \${filename}</span>
              \${isAlreadyMocked 
                ? \`<span class="mock-status-pill mocked">\${ICONS.check} Active Mock</span>\` 
                : \`<button class="mini-mock-btn btn-compact" style="padding: 2px 7px;">\${ICONS.plus} Mock</button>\`
              }
            </div>
          \`;

          const mockBtn = card.querySelector('.mini-mock-btn');
          if (mockBtn) {
            mockBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'mockDetectedCall', call });
            });
          }

          card.addEventListener('click', () => {
            selectedId = call.id;
            render();
          });
          itemList.appendChild(card);
        });
      } else if (activeTab === 'traffic') {
        const filtered = state.traffic.filter(t => {
          const matchUrl = t.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || t.method.toUpperCase() === filterMethod;
          return matchUrl && matchMethod;
        });

        if (filtered.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt';
          empty.style.padding = '30px 10px';
          empty.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.activity}</div>
            <strong style="color: #fff;">No traffic recorded yet</strong>
            <span style="max-width: 280px; font-size: 11px;">Make a request via proxy (127.0.0.1:45990) or attach CDP to record real-time requests.</span>
          \`;
          itemList.appendChild(empty);
          return;
        }

        [...filtered].reverse().forEach(t => {
          const card = document.createElement('div');
          card.className = 'list-card' + (selectedId === t.id ? ' selected' : '');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(t.method)}">\${t.method}</span>
              <span class="path-text" title="\${t.url}">\${t.url}</span>
              <span class="status-code-tag \${getStatusClass(t.statusCode)}">\${t.statusCode}</span>
            </div>
            <div class="card-sub">
              <span class="mock-status-pill \${t.isMocked ? 'mocked' : 'pass'}">\${t.isMocked ? 'Mocked' : 'Passthrough'}</span>
              <span>\${t.durationMs}ms</span>
            </div>
          \`;
          card.addEventListener('click', () => {
            selectedId = t.id;
            render();
          });
          itemList.appendChild(card);
        });
      } else {
        const filtered = state.routes.filter(r => {
          const matchUrl = r.urlPattern.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || r.method.toUpperCase() === filterMethod || r.method === '*';
          return matchUrl && matchMethod;
        });

        if (filtered.length === 0 && selectedId !== 'NEW_ROUTE') {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt';
          empty.style.padding = '30px 10px';
          empty.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.layers}</div>
            <strong style="color: #fff;">No mock routes active</strong>
            <span style="max-width: 280px; font-size: 11px;">Configure mock endpoints or auto-mock from the Discovered APIs tab.</span>
            <button id="emptyCreateBtn" class="primary btn-compact" nonce="${nonce}" style="margin-top: 6px;">
              \${ICONS.plus}
              <span>New Mock Route</span>
            </button>
          \`;
          empty.querySelector('#emptyCreateBtn').addEventListener('click', () => {
            selectedId = 'NEW_ROUTE';
            render();
          });
          itemList.appendChild(empty);
          return;
        }

        filtered.forEach(r => {
          const card = document.createElement('div');
          card.className = 'list-card' + (selectedId === r.id ? ' selected' : '');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(r.method)}">\${r.method}</span>
              <span class="path-text" title="\${r.urlPattern}">\${r.urlPattern}</span>
              <span class="status-code-tag \${getStatusClass(r.statusCode)}">\${r.statusCode}</span>
            </div>
            <div class="card-sub">
              <span style="display: flex; align-items: center; gap: 5px;">
                <span class="status-dot \${r.enabled ? 'online' : 'offline'}"></span>
                <span>\${r.enabled ? 'Active' : 'Disabled'}</span>
              </span>
              <span>\${r.delayMs ? r.delayMs + 'ms delay' : 'Instant'}</span>
            </div>
          \`;
          card.addEventListener('click', () => {
            selectedId = r.id;
            render();
          });
          itemList.appendChild(card);
        });
      }
    }

    function renderInspector() {
      if (!selectedId) {
        rightPane.innerHTML = \`
          <div class="empty-prompt">
            <div class="empty-icon-wrapper">\${ICONS.radar}</div>
            <h2 style="margin: 0; color: #fff; font-size: 18px; font-weight: 600;">MockScope Workbench</h2>
            <span style="font-size: 13px; color: var(--muted); max-width: 440px;">Select an endpoint on the left to inspect, configure mock responses, or export test handlers.</span>
            <div class="feature-pills">
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.wand} <strong>Type Synthesis</strong></div>
                <span>Infers schemas and generates mock payloads directly from TypeScript return types</span>
              </div>
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.activity} <strong>Loopback Proxy</strong></div>
                <span>Intercepts traffic on 127.0.0.1 with in-memory credential redaction</span>
              </div>
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.code} <strong>Test Exporter</strong></div>
                <span>1-click generation of native Playwright page.route() and MSW v2 handlers</span>
              </div>
            </div>
          </div>
        \`;
        return;
      }

      if (activeTab === 'discovered') {
        const call = (state.discoveredCalls || []).find(c => c.id === selectedId);
        if (!call) return;
        const isAlreadyMocked = state.routes.some(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${call.method}</span>
              <span class="path-display" title="\${call.url}">\${call.url}</span>
            </div>
            <div class="inspector-actions">
              \${isAlreadyMocked ? \`
                <button id="openDiscoveredInBrowserBtn" nonce="${nonce}" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open in Browser</span>
                </button>
              \` : ''}
              <button id="inspectMockBtn" class="accent" nonce="${nonce}">
                \${ICONS.wand}
                <span>Auto-Synthesize Mock</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>HTTP Client</label>
                <input type="text" readonly value="\${call.clientType}">
              </div>
              <div class="form-group" style="flex: 1;">
                <label>TypeScript Generic Return Type</label>
                <input type="text" readonly value="\${call.typeArgument || 'None (auto-inferred)'}">
              </div>
            </div>

            <div class="form-group">
              <label>Source Code Location</label>
              <input type="text" readonly value="\${call.fileName || 'source.ts'} (Line \${call.range.start.line + 1})">
            </div>

            <div class="form-group">
              <label>
                <span>Detected Expression in Source</span>
                <button id="copyExprBtn" class="btn-compact" nonce="${nonce}" title="Copy code expression">\${ICONS.copy} Copy</button>
              </label>
              <div class="tab-content-panel">\${call.rawExpression}</div>
            </div>

            <div class="info-callout">
              <strong>Zero-Configuration Mock Guarantee:</strong> MockScope analyzes this call site's TypeScript type <code>&lt;\${call.typeArgument || 'Object'}&gt;</code> and generates matching realistic data deterministically without requiring manual schema definitions.
            </div>
          </div>
        \`;

        document.getElementById('inspectMockBtn').addEventListener('click', () => {
          vscode.postMessage({ type: 'mockDetectedCall', call });
          activeTab = 'routes';
          tabRoutes.classList.add('active');
          tabDiscovered.classList.remove('active');
          tabTraffic.classList.remove('active');
          render();
        });

        const openDiscoveredInBrowserBtn = document.getElementById('openDiscoveredInBrowserBtn');
        if (openDiscoveredInBrowserBtn) {
          openDiscoveredInBrowserBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openEndpointInBrowser', url: call.url });
          });
        }

        const copyExprBtn = document.getElementById('copyExprBtn');
        if (copyExprBtn) {
          copyExprBtn.addEventListener('click', () => {
            copyWithFeedback(copyExprBtn, call.rawExpression, 'code expression');
          });
        }
      } else if (activeTab === 'traffic') {
        const item = state.traffic.find(t => t.id === selectedId);
        if (!item) return;

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(item.method)}">\${item.method}</span>
              <span class="path-display" title="\${item.url}">\${item.url}</span>
              <span class="status-code-tag \${getStatusClass(item.statusCode)}">\${item.statusCode}</span>
            </div>
            <div class="inspector-actions">
              <button id="openTrafficInBrowserBtn" nonce="${nonce}" title="Preview endpoint in browser">
                \${ICONS.external}
                <span>Open in Browser</span>
              </button>
              <button id="promoteMockBtn" class="primary" nonce="${nonce}">
                \${ICONS.plus}
                <span>Convert to Mock Route</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>Status & Latency</label>
                <input type="text" readonly value="\${item.statusCode} (\${item.durationMs}ms)">
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Interception Mode</label>
                <input type="text" readonly value="\${item.isMocked ? 'Mocked Response' : 'Upstream Passthrough'}">
              </div>
            </div>

            <div class="form-group">
              <label>
                <span>Request Headers (Sanitized)</span>
                <button id="copyReqHdrBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
              </label>
              <div class="tab-content-panel">\${JSON.stringify(item.requestHeaders, null, 2)}</div>
            </div>

            \${item.requestBody ? \`
              <div class="form-group">
                <label>Request Body</label>
                <div class="tab-content-panel">\${item.requestBody}</div>
              </div>
            \` : ''}

            <div class="form-group">
              <label>Response Headers</label>
              <div class="tab-content-panel">\${JSON.stringify(item.responseHeaders, null, 2)}</div>
            </div>

            <div class="form-group">
              <label>
                <span>Response Body</span>
                <button id="copyResBodyBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
              </label>
              <div class="tab-content-panel">\${item.responseBody || '(empty body)'}</div>
            </div>
          </div>
        \`;

        const copyReqHdrBtn = document.getElementById('copyReqHdrBtn');
        if (copyReqHdrBtn) {
          copyReqHdrBtn.addEventListener('click', () => {
            copyWithFeedback(copyReqHdrBtn, JSON.stringify(item.requestHeaders, null, 2), 'Request Headers');
          });
        }

        const copyResBodyBtn = document.getElementById('copyResBodyBtn');
        if (copyResBodyBtn) {
          copyResBodyBtn.addEventListener('click', () => {
            copyWithFeedback(copyResBodyBtn, item.responseBody || '', 'Response Body');
          });
        }

        const openTrafficInBrowserBtn = document.getElementById('openTrafficInBrowserBtn');
        if (openTrafficInBrowserBtn) {
          openTrafficInBrowserBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openEndpointInBrowser', url: item.url });
          });
        }

        document.getElementById('promoteMockBtn').addEventListener('click', () => {
          let bodyParsed;
          try {
            bodyParsed = JSON.parse(item.responseBody || '{}');
          } catch {
            bodyParsed = item.responseBody;
          }

          const newRoute = {
            id: 'route_' + Date.now(),
            method: item.method,
            urlPattern: item.url,
            statusCode: item.statusCode,
            body: bodyParsed,
            headers: { 'Content-Type': 'application/json' },
            enabled: true,
            createdAt: Date.now(),
            source: 'recorded'
          };

          vscode.postMessage({ type: 'saveRoute', route: newRoute });
          activeTab = 'routes';
          tabRoutes.classList.add('active');
          tabDiscovered.classList.remove('active');
          tabTraffic.classList.remove('active');
          selectedId = newRoute.id;
          render();
        });
      } else {
        let route = selectedId === 'NEW_ROUTE'
          ? { id: 'route_' + Date.now(), method: 'GET', urlPattern: '/api/v1/resource', statusCode: 200, delayMs: 0, body: { message: 'Sample mock response' }, enabled: true }
          : state.routes.find(r => r.id === selectedId);

        if (!route) return;

        const bodyStr = typeof route.body === 'string' ? route.body : JSON.stringify(route.body, null, 2);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(route.method)}">\${route.method}</span>
              <span>\${selectedId === 'NEW_ROUTE' ? 'Create New Mock Route' : 'Edit Mock Route'}</span>
            </div>
            <div class="inspector-actions">
              \${selectedId !== 'NEW_ROUTE' ? \`
                <button id="openInBrowserBtn" nonce="${nonce}" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open in Browser</span>
                </button>
                <button id="copyPlaywrightBtn" nonce="${nonce}">
                  \${ICONS.copy}
                  <span>Playwright</span>
                </button>
                <button id="copyMswBtn" nonce="${nonce}">
                  \${ICONS.copy}
                  <span>MSW v2</span>
                </button>
                <button id="deleteRouteBtn" class="danger" nonce="${nonce}">
                  \${ICONS.trash}
                  <span>Delete</span>
                </button>
              \` : ''}
              <button id="saveRouteBtn" class="primary" nonce="${nonce}">
                \${ICONS.save}
                <span>Save Route</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="width: 140px;">
                <label>HTTP Method</label>
                <select id="editMethod" nonce="${nonce}">
                  <option value="GET" \${route.method === 'GET' ? 'selected' : ''}>GET</option>
                  <option value="POST" \${route.method === 'POST' ? 'selected' : ''}>POST</option>
                  <option value="PUT" \${route.method === 'PUT' ? 'selected' : ''}>PUT</option>
                  <option value="PATCH" \${route.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                  <option value="DELETE" \${route.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                  <option value="*" \${route.method === '*' ? 'selected' : ''}>* (ANY)</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>URL Pattern (supports wildcards * and :param)</label>
                <input type="text" id="editUrlPattern" value="\${route.urlPattern}" nonce="${nonce}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>HTTP Status Code</label>
                <select id="editStatusCode" nonce="${nonce}">
                  <option value="200" \${route.statusCode === 200 ? 'selected' : ''}>200 OK</option>
                  <option value="201" \${route.statusCode === 201 ? 'selected' : ''}>201 Created</option>
                  <option value="204" \${route.statusCode === 204 ? 'selected' : ''}>204 No Content</option>
                  <option value="400" \${route.statusCode === 400 ? 'selected' : ''}>400 Bad Request</option>
                  <option value="401" \${route.statusCode === 401 ? 'selected' : ''}>401 Unauthorized</option>
                  <option value="404" \${route.statusCode === 404 ? 'selected' : ''}>404 Not Found</option>
                  <option value="500" \${route.statusCode === 500 ? 'selected' : ''}>500 Server Error</option>
                </select>
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Simulated Latency (ms)</label>
                <input type="text" id="editDelayMs" value="\${route.delayMs || 0}" nonce="${nonce}">
              </div>
            </div>

            <div class="form-group">
              <label>
                <span>Response Body (JSON or Plain Text)</span>
                <button id="formatJsonBtn" class="btn-compact" nonce="${nonce}">Format JSON</button>
              </label>
              <textarea id="editBody" class="json-editor" nonce="${nonce}">\${bodyStr}</textarea>
            </div>
          </div>
        \`;

        const formatBtn = document.getElementById('formatJsonBtn');
        if (formatBtn) {
          formatBtn.addEventListener('click', () => {
            const bodyEl = document.getElementById('editBody');
            try {
              const parsed = JSON.parse(bodyEl.value);
              bodyEl.value = JSON.stringify(parsed, null, 2);
            } catch {
            }
          });
        }

        document.getElementById('saveRouteBtn').addEventListener('click', () => {
          const method = document.getElementById('editMethod').value;
          const urlPattern = document.getElementById('editUrlPattern').value.trim();
          const statusCode = parseInt(document.getElementById('editStatusCode').value, 10);
          const delayMs = parseInt(document.getElementById('editDelayMs').value, 10) || 0;
          const rawBody = document.getElementById('editBody').value;

          let parsedBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = rawBody;
          }

          const savedRoute = {
            id: route.id,
            method,
            urlPattern,
            statusCode,
            delayMs,
            body: parsedBody,
            headers: { 'Content-Type': 'application/json' },
            enabled: true,
            createdAt: route.createdAt || Date.now(),
            source: 'manual'
          };

          vscode.postMessage({ type: 'saveRoute', route: savedRoute });
          selectedId = savedRoute.id;
          render();
        });

        if (selectedId !== 'NEW_ROUTE') {
          const openInBrowserBtn = document.getElementById('openInBrowserBtn');
          if (openInBrowserBtn) {
            openInBrowserBtn.addEventListener('click', () => {
              vscode.postMessage({ type: 'openEndpointInBrowser', url: route.urlPattern });
            });
          }

          document.getElementById('deleteRouteBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'deleteRoute', routeId: route.id });
            selectedId = null;
            render();
          });

          const copyPlaywrightBtn = document.getElementById('copyPlaywrightBtn');
          if (copyPlaywrightBtn) {
            copyPlaywrightBtn.addEventListener('click', () => {
              const spec = \`await page.route('**\${route.urlPattern}', async (route) => {
  await route.fulfill({
    status: \${route.statusCode},
    contentType: 'application/json',
    body: JSON.stringify(\${bodyStr}, null, 2),
  });
});\`;
              copyWithFeedback(copyPlaywrightBtn, spec, 'Playwright spec');
            });
          }

          const copyMswBtn = document.getElementById('copyMswBtn');
          if (copyMswBtn) {
            copyMswBtn.addEventListener('click', () => {
              const m = (route.method || 'get').toLowerCase();
              const fn = ['get', 'post', 'put', 'patch', 'delete'].includes(m) ? m : 'all';
              const handler = \`http.\${fn}('\${route.urlPattern}', () => {
  return HttpResponse.json(\${bodyStr}, { status: \${route.statusCode} });
});\`;
              copyWithFeedback(copyMswBtn, handler, 'MSW v2 handler');
            });
          }
        }
      }
    }
  </script>
</body>
</html>`;
  }
}
