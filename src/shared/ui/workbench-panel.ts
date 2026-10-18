import * as vscode from 'vscode';
import {
  generateCspNonce,
  assertLoopbackHost,
  type MockRoute,
  type TrafficEntry,
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
    },
    actions: {
      onToggleProxy: () => Promise<void>;
      onToggleCdp: () => Promise<void>;
      onSaveRoute: (route: MockRoute) => void;
      onDeleteRoute: (routeId: string) => void;
      onToggleRoute: (routeId: string) => void;
      onClearTraffic: () => void;
      onCopyText: (text: string, label: string) => void;
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
    },
    private readonly actions: {
      onToggleProxy: () => Promise<void>;
      onToggleCdp: () => Promise<void>;
      onSaveRoute: (route: MockRoute) => void;
      onDeleteRoute: (routeId: string) => void;
      onToggleRoute: (routeId: string) => void;
      onClearTraffic: () => void;
      onCopyText: (text: string, label: string) => void;
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
          case 'ready':
            this.refresh();
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
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, #3c3c3c);
      --accent: #007acc;
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
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
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: #fff;
    }
    .top-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .badge-online { background: rgba(63, 185, 80, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-offline { background: rgba(136, 136, 136, 0.2); color: #888; border: 1px solid #555; }

    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: 1px solid transparent;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    button:hover { background: var(--btn-hover); }
    button.secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--fg);
    }
    button.secondary:hover {
      background: var(--card-bg);
      border-color: var(--fg);
    }
    button.danger {
      background: var(--danger);
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
      padding: 10px;
      text-align: center;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      color: #888;
      border-bottom: 2px solid transparent;
      user-select: none;
    }
    .tab.active {
      color: var(--fg);
      border-bottom-color: var(--accent);
      background: var(--bg);
    }
    .filter-bar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 8px;
    }
    input[type="text"], select, textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
    }
    input[type="text"]:focus, select:focus, textarea:focus {
      outline: 1px solid var(--accent);
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
      transition: border 0.15s, background 0.15s;
    }
    .list-card:hover {
      border-color: #666;
    }
    .list-card.selected {
      border-color: var(--accent);
      background: rgba(0, 122, 204, 0.1);
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
      font-family: monospace;
    }
    .tag-get { background: #007acc; color: #fff; }
    .tag-post { background: #238636; color: #fff; }
    .tag-put { background: #b08800; color: #fff; }
    .tag-delete { background: #da3633; color: #fff; }
    .tag-other { background: #6e7681; color: #fff; }
    .path-text {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status-code-tag {
      font-weight: 600;
      font-size: 11px;
    }
    .card-sub {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #888;
    }

    .right-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--card-bg);
    }
    .inspector-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .inspector-title {
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .inspector-actions {
      display: flex;
      gap: 8px;
    }
    .inspector-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
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
      color: #999;
    }
    .json-editor {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      min-height: 240px;
      resize: vertical;
      line-height: 1.4;
      white-space: pre;
    }
    .empty-prompt {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: #777;
      gap: 12px;
    }
    .tab-content-panel {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      max-height: 220px;
      overflow-y: auto;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>📡</span>
      <span>MockScope Workbench</span>
    </div>
    <div class="top-controls">
      <div>
        <span id="proxyBadge" class="badge badge-offline">Proxy: OFF</span>
      </div>
      <div>
        <span id="cdpBadge" class="badge badge-offline">CDP: Detached</span>
      </div>
      <button id="toggleProxyBtn" nonce="${nonce}">Toggle Proxy</button>
      <button id="toggleCdpBtn" nonce="${nonce}" class="secondary">Toggle CDP</button>
      <button id="addMockBtn" nonce="${nonce}">+ New Mock Route</button>
    </div>
  </header>

  <div class="workbench-layout">
    <!-- Left Pane -->
    <div class="left-pane">
      <div class="tab-bar">
        <div id="tabTraffic" class="tab active" nonce="${nonce}">Live Traffic (<span id="trafficCount">0</span>)</div>
        <div id="tabRoutes" class="tab" nonce="${nonce}">Mock Routes (<span id="routeCount">0</span>)</div>
      </div>
      <div class="filter-bar">
        <input type="text" id="filterInput" class="search-input" placeholder="Search URL path..." nonce="${nonce}">
        <select id="methodFilter" nonce="${nonce}">
          <option value="ALL">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <button id="clearBtn" class="secondary" nonce="${nonce}" title="Clear Traffic">Clear</button>
      </div>
      <div id="itemList" class="item-list-container">
        <!-- Rendered dynamically -->
      </div>
    </div>

    <!-- Right Pane (Inspector & Editor) -->
    <div id="rightPane" class="right-pane">
      <div class="empty-prompt">
        <span style="font-size: 36px;">🎯</span>
        <span>Select an intercepted request or mock route to inspect and edit.</span>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    let state = {
      proxy: { running: false, port: 45990 },
      cdp: { attached: false, port: 9222 },
      routes: [],
      traffic: []
    };

    let activeTab = 'traffic'; // 'traffic' | 'routes'
    let selectedId = null;
    let filterText = '';
    let filterMethod = 'ALL';

    const toggleProxyBtn = document.getElementById('toggleProxyBtn');
    const toggleCdpBtn = document.getElementById('toggleCdpBtn');
    const addMockBtn = document.getElementById('addMockBtn');
    const clearBtn = document.getElementById('clearBtn');
    const tabTraffic = document.getElementById('tabTraffic');
    const tabRoutes = document.getElementById('tabRoutes');
    const filterInput = document.getElementById('filterInput');
    const methodFilter = document.getElementById('methodFilter');
    const itemList = document.getElementById('itemList');
    const rightPane = document.getElementById('rightPane');

    tabTraffic.addEventListener('click', () => {
      activeTab = 'traffic';
      tabTraffic.classList.add('active');
      tabRoutes.classList.remove('active');
      selectedId = null;
      render();
    });

    tabRoutes.addEventListener('click', () => {
      activeTab = 'routes';
      tabRoutes.classList.add('active');
      tabTraffic.classList.remove('active');
      selectedId = null;
      render();
    });

    toggleProxyBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleProxy' }));
    toggleCdpBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleCdp' }));
    clearBtn.addEventListener('click', () => vscode.postMessage({ type: 'clearTraffic' }));

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
      tabTraffic.classList.remove('active');
      selectedId = 'NEW_ROUTE';
      render();
    });

    window.addEventListener('message', (event) => {
      if (event.data.type === 'stateUpdate') {
        state = event.data;
        render();
      }
    });

    vscode.postMessage({ type: 'ready' });

    function render() {
      const proxyBadge = document.getElementById('proxyBadge');
      if (state.proxy.running) {
        proxyBadge.textContent = 'Proxy: 127.0.0.1:' + state.proxy.port;
        proxyBadge.className = 'badge badge-online';
        toggleProxyBtn.textContent = 'Stop Proxy';
      } else {
        proxyBadge.textContent = 'Proxy: OFF';
        proxyBadge.className = 'badge badge-offline';
        toggleProxyBtn.textContent = 'Start Proxy';
      }

      const cdpBadge = document.getElementById('cdpBadge');
      if (state.cdp.attached) {
        cdpBadge.textContent = 'CDP: Attached (' + state.cdp.port + ')';
        cdpBadge.className = 'badge badge-online';
        toggleCdpBtn.textContent = 'Detach CDP';
      } else {
        cdpBadge.textContent = 'CDP: Detached';
        cdpBadge.className = 'badge badge-offline';
        toggleCdpBtn.textContent = 'Attach CDP';
      }

      document.getElementById('trafficCount').textContent = state.traffic.length;
      document.getElementById('routeCount').textContent = state.routes.length;

      renderList();
      renderInspector();
    }

    function getMethodTagClass(method) {
      const m = (method || '').toLowerCase();
      if (m === 'get') return 'tag-get';
      if (m === 'post') return 'tag-post';
      if (m === 'put' || m === 'patch') return 'tag-put';
      if (m === 'delete') return 'tag-delete';
      return 'tag-other';
    }

    function renderList() {
      itemList.innerHTML = '';

      if (activeTab === 'traffic') {
        const filtered = state.traffic.filter(t => {
          const matchUrl = t.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || t.method.toUpperCase() === filterMethod;
          return matchUrl && matchMethod;
        });

        if (filtered.length === 0) {
          itemList.innerHTML = '<div style="color: #888; text-align: center; padding: 24px;">No traffic recorded yet. Make a request via proxy or browser.</div>';
          return;
        }

        [...filtered].reverse().forEach(t => {
          const card = document.createElement('div');
          card.className = 'list-card' + (selectedId === t.id ? ' selected' : '');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(t.method)}">\${t.method}</span>
              <span class="path-text" title="\${t.url}">\${t.url}</span>
              <span class="status-code-tag" style="color: \${t.statusCode < 400 ? 'var(--success)' : 'var(--danger)'}">\${t.statusCode}</span>
            </div>
            <div class="card-sub">
              <span>\${t.isMocked ? '⚡ Mocked' : '🌐 Passthrough'}</span>
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
          itemList.innerHTML = '<div style="color: #888; text-align: center; padding: 24px;">No mock routes. Click "+ New Mock Route" to create one.</div>';
          return;
        }

        filtered.forEach(r => {
          const card = document.createElement('div');
          card.className = 'list-card' + (selectedId === r.id ? ' selected' : '');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(r.method)}">\${r.method}</span>
              <span class="path-text" title="\${r.urlPattern}">\${r.urlPattern}</span>
              <span class="status-code-tag">\${r.statusCode}</span>
            </div>
            <div class="card-sub">
              <span>\${r.enabled ? '🟢 Enabled' : '⚪ Disabled'}</span>
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
            <span style="font-size: 36px;">🎯</span>
            <span>Select an intercepted request or mock route to inspect and edit.</span>
          </div>
        \`;
        return;
      }

      if (activeTab === 'traffic') {
        const item = state.traffic.find(t => t.id === selectedId);
        if (!item) return;

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(item.method)}">\${item.method}</span>
              <span>\${item.url}</span>
            </div>
            <div class="inspector-actions">
              <button id="promoteMockBtn" nonce="${nonce}">⚡ Convert to Mock Route</button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>Status Code</label>
                <input type="text" readonly value="\${item.statusCode} (\${item.durationMs}ms)">
              </div>
              <div class="form-group" style="flex: 1;">
                <label>Type</label>
                <input type="text" readonly value="\${item.isMocked ? 'Mocked Response' : 'Upstream Response'}">
              </div>
            </div>

            <div class="form-group">
              <label>Request Headers (Credentials Redacted)</label>
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
              <label>Response Body</label>
              <div class="tab-content-panel">\${item.responseBody || '(empty)'}</div>
            </div>
          </div>
        \`;

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
          tabTraffic.classList.remove('active');
          selectedId = newRoute.id;
          render();
        });
      } else {
        let route = selectedId === 'NEW_ROUTE'
          ? { id: 'route_' + Date.now(), method: 'GET', urlPattern: '/api/v1/resource', statusCode: 200, delayMs: 0, body: { message: 'Sample mock' }, enabled: true }
          : state.routes.find(r => r.id === selectedId);

        if (!route) return;

        const bodyStr = typeof route.body === 'string' ? route.body : JSON.stringify(route.body, null, 2);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span>\${selectedId === 'NEW_ROUTE' ? '✨ Create New Mock Route' : '✏️ Edit Mock Route'}</span>
            </div>
            <div class="inspector-actions">
              \${selectedId !== 'NEW_ROUTE' ? \`
                <button id="copyPlaywrightBtn" class="secondary" nonce="${nonce}">Copy Playwright</button>
                <button id="copyMswBtn" class="secondary" nonce="${nonce}">Copy MSW</button>
                <button id="deleteRouteBtn" class="secondary danger" nonce="${nonce}">Delete</button>
              \` : ''}
              <button id="saveRouteBtn" nonce="${nonce}">💾 Save Mock Route</button>
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
                <label>URL Pattern (supports wildcards /api/* and :id)</label>
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
                <label>Artificial Latency (ms)</label>
                <input type="text" id="editDelayMs" value="\${route.delayMs || 0}" nonce="${nonce}">
              </div>
            </div>

            <div class="form-group">
              <label>Response Body (JSON or Text)</label>
              <textarea id="editBody" class="json-editor" nonce="${nonce}">\${bodyStr}</textarea>
            </div>
          </div>
        \`;

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
          document.getElementById('deleteRouteBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'deleteRoute', routeId: route.id });
            selectedId = null;
            render();
          });

          document.getElementById('copyPlaywrightBtn').addEventListener('click', () => {
            const spec = \`await page.route('**\${route.urlPattern}', async (route) => {
  await route.fulfill({
    status: \${route.statusCode},
    contentType: 'application/json',
    body: JSON.stringify(\${bodyStr}, null, 2),
  });
});\`;
            vscode.postMessage({ type: 'copyText', text: spec, label: 'Playwright spec' });
          });

          document.getElementById('copyMswBtn').addEventListener('click', () => {
            const m = (route.method || 'get').toLowerCase();
            const fn = ['get', 'post', 'put', 'patch', 'delete'].includes(m) ? m : 'all';
            const handler = \`http.\${fn}('\${route.urlPattern}', () => {
  return HttpResponse.json(\${bodyStr}, { status: \${route.statusCode} });
});\`;
            vscode.postMessage({ type: 'copyText', text: handler, label: 'MSW v2 handler' });
          });
        }
      }
    }
  </script>
</body>
</html>`;
  }
}
