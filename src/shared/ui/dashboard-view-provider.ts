import * as vscode from 'vscode';
import { generateCspNonce, assertLoopbackHost, type MockRoute, type TrafficEntry } from '../kernel/index';

export class DashboardViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mockscope.dashboardView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getProxyState: () => { running: boolean; port: number },
    private readonly getCdpState: () => { attached: boolean; port: number },
    private readonly getRoutes: () => MockRoute[],
    private readonly getTraffic: () => TrafficEntry[],
    private readonly onToggleRoute: (routeId: string) => void,
    private readonly onClearTraffic: () => void,
    private readonly onToggleProxy: () => void,
    private readonly onToggleCdp: () => void,
    private readonly onOpenWorkbench: () => void,
    private readonly onOpenEndpointInBrowser?: (url: string) => void,
    private readonly getProjectStack?: () => any
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case 'openWorkbench':
          this.onOpenWorkbench();
          break;
        case 'toggleProxy':
          this.onToggleProxy();
          break;
        case 'toggleCdp':
          this.onToggleCdp();
          break;
        case 'toggleRoute':
          this.onToggleRoute(message.routeId);
          break;
        case 'clearTraffic':
          this.onClearTraffic();
          break;
        case 'openEndpointInBrowser':
          this.onOpenEndpointInBrowser?.(message.url);
          break;
        case 'refresh':
          this.refresh();
          break;
      }
    });

    this.refresh();
  }

  public refresh(): void {
    if (!this._view) return;

    this._view.webview.postMessage({
      type: 'stateUpdate',
      proxy: this.getProxyState(),
      cdp: this.getCdpState(),
      routes: this.getRoutes(),
      traffic: this.getTraffic(),
      projectStack: this.getProjectStack?.(),
    });
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
  <title>MockScope</title>
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, #141417);
      --fg: var(--vscode-foreground, #e4e4e7);
      --muted: var(--vscode-descriptionForeground, #8b8b93);
      --border: var(--vscode-panel-border, var(--vscode-widget-border, #27272a));
      --hover-bg: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
      --focus-border: var(--vscode-focusBorder, #3b82f6);
      --btn-bg: var(--vscode-button-background, #2563eb);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1d4ed8);
      --ui-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      --code-font: var(--vscode-editor-font-family, Consolas, monospace);
      --success: var(--vscode-testing-iconPassed, #22c55e);
      --warning: var(--vscode-editorWarning-foreground, #eab308);
      --danger: var(--vscode-errorForeground, #ef4444);
      --offline-dot: #71717a;

      --method-get: #60a5fa;
      --method-post: #4ade80;
      --method-put: #facc15;
      --method-delete: #f87171;
    }

    body.vscode-light,
    body.vscode-high-contrast-light {
      --bg: var(--vscode-sideBar-background, #f3f3f3);
      --fg: var(--vscode-foreground, #1f1f1f);
      --muted: var(--vscode-descriptionForeground, #5f6368);
      --border: var(--vscode-panel-border, #e0e0e0);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(0, 0, 0, 0.045));
      --focus-border: var(--vscode-focusBorder, #005fb8);
      --success: #15803d;
      --warning: #b45309;
      --danger: #dc2626;
      --offline-dot: #8e8e93;

      --method-get: #005fb8;
      --method-post: #15803d;
      --method-put: #b45309;
      --method-delete: #dc2626;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      font-family: var(--ui-font);
      padding: 12px;
      color: var(--fg);
      background-color: var(--bg);
      font-size: 12px;
      margin: 0;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }
    .header-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .brand-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .brand-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      color: var(--fg);
      letter-spacing: -0.01em;
    }
    .brand-title svg {
      color: var(--fg);
      flex-shrink: 0;
    }
    .stack-meta {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
    }
    .status-row strong {
      color: var(--fg);
      font-weight: 500;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--fg);
      font-variant-numeric: tabular-nums;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }
    .status-dot.online { background-color: var(--success); }
    .status-dot.offline { background-color: var(--offline-dot); }
    .button-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    button {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 4px 8px;
      height: 24px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-family: var(--ui-font);
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.1s ease, border-color 0.1s ease;
      user-select: none;
    }
    button:hover:not(:disabled) {
      background: var(--hover-bg);
      border-color: var(--muted);
    }
    button:focus-visible {
      outline: 1px solid var(--focus-border);
      outline-offset: 1px;
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    button.primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border-color: transparent;
    }
    button.primary:hover:not(:disabled) {
      background: var(--btn-hover);
      border-color: transparent;
    }
    .section-title {
      font-weight: 500;
      font-size: 11px;
      margin: 12px 0 4px 0;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .item-list {
      display: flex;
      flex-direction: column;
      max-height: 240px;
      overflow-y: auto;
      border-top: 1px solid var(--border);
    }
    .row-item {
      border-bottom: 1px solid var(--border);
      padding: 6px 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      cursor: pointer;
    }
    .row-item:hover {
      background: var(--hover-bg);
    }
    .row-item.disabled .url-text {
      color: var(--muted);
    }
    .route-toggle-btn {
      padding: 2px 4px;
      height: 18px;
      border: 1px solid transparent;
      background: transparent;
    }
    .route-toggle-btn:hover {
      border-color: var(--border);
    }
    .method-badge {
      font-weight: 600;
      font-size: 11px;
      width: 38px;
      font-family: var(--code-font);
      flex-shrink: 0;
    }
    .method-get { color: var(--method-get); }
    .method-post { color: var(--method-post); }
    .method-put { color: var(--method-put); }
    .method-delete { color: var(--method-delete); }
    .method-other { color: var(--muted); }
    .url-text {
      font-family: var(--code-font);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      color: var(--fg);
    }
    .meta-code {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .status-2xx { color: var(--success); }
    .status-4xx { color: var(--warning); }
    .status-5xx { color: var(--danger); }
    .empty-state {
      color: var(--muted);
      padding: 8px 0;
      font-size: 11px;
    }
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition: none !important;
        animation: none !important;
      }
    }
  </style>
</head>
<body>
  <header class="header-panel" role="banner">
    <div class="brand-row">
      <span class="brand-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.25" stroke="#3B82F6" stroke-width="1.85"/>
          <line x1="12" y1="1.25" x2="12" y2="3.75" stroke="#3B82F6" stroke-width="1.85"/>
          <line x1="12" y1="20.25" x2="12" y2="22.75" stroke="#3B82F6" stroke-width="1.85"/>
          <line x1="1.25" y1="12" x2="3.75" y2="12" stroke="#3B82F6" stroke-width="1.85"/>
          <line x1="20.25" y1="12" x2="22.75" y2="12" stroke="#3B82F6" stroke-width="1.85"/>
          <path d="M9.75 8.5C8.5 8.5 8.25 9.25 8.25 10.25V11C8.25 11.55 7.65 12 7 12C7.65 12 8.25 12.45 8.25 13V13.75C8.25 14.75 8.5 15.5 9.75 15.5" stroke="currentColor" stroke-width="1.85"/>
          <path d="M14.25 8.5C15.5 8.5 15.75 9.25 15.75 10.25V11C15.75 11.55 16.35 12 17 12C16.35 12 15.75 12.45 15.75 13V13.75C15.75 14.75 15.5 15.5 14.25 15.5" stroke="currentColor" stroke-width="1.85"/>
          <circle cx="12" cy="12" r="1.5" fill="#38BDF8" stroke="none"/>
        </svg>
        <span>MockScope</span>
      </span>
      <span id="sidebarStackBadge" class="stack-meta">Detecting...</span>
    </div>
    <div class="status-row">
      <span><strong>Proxy</strong> 127.0.0.1:<span id="proxyPortText">45990</span></span>
      <output class="status-indicator" aria-live="polite">
        <span id="proxyDot" class="status-dot offline" aria-hidden="true"></span>
        <span id="proxyText">Off</span>
      </output>
    </div>
    <div class="status-row">
      <span><strong>CDP</strong> 127.0.0.1:<span id="cdpPortText">9222</span></span>
      <output class="status-indicator" aria-live="polite">
        <span id="cdpDot" class="status-dot offline" aria-hidden="true"></span>
        <span id="cdpText">Off</span>
      </output>
    </div>
    <nav class="button-group" aria-label="Runtime Controls">
      <button type="button" id="openWorkbenchBtn" class="primary" nonce="${nonce}" title="Open MockScope Workbench">
        <span>Workbench</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button type="button" id="toggleProxyBtn" nonce="${nonce}" title="Start or stop local loopback proxy">Start Proxy</button>
      <button type="button" id="toggleCdpBtn" nonce="${nonce}" title="Attach or detach Chrome DevTools bridge">Attach CDP</button>
      <button type="button" id="clearTrafficBtn" nonce="${nonce}" title="Clear recorded traffic">Clear</button>
    </nav>
  </header>

  <main>
    <section aria-labelledby="routesHeading">
      <h2 id="routesHeading" class="section-title">
        <span>Routes</span>
        <span id="routeCount" class="meta-code">0</span>
      </h2>
      <div id="routeList" class="item-list" role="list">
        <div class="empty-state">No mock routes configured.</div>
      </div>
    </section>

    <section aria-labelledby="trafficHeading">
      <h2 id="trafficHeading" class="section-title">
        <span>Traffic</span>
        <span class="meta-code"><span id="trafficCount">0</span>/100</span>
      </h2>
      <div id="trafficList" class="item-list" role="log" aria-live="polite">
        <div class="empty-state">No intercepted requests.</div>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    document.getElementById('openWorkbenchBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openWorkbench' });
    });
    document.getElementById('toggleProxyBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleProxy' });
    });
    document.getElementById('toggleCdpBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleCdp' });
    });
    document.getElementById('clearTrafficBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'clearTraffic' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'stateUpdate') {
        renderState(msg);
      }
    });

    function getMethodClass(method) {
      const m = (method || '').toLowerCase();
      if (m === 'get') return 'method-get';
      if (m === 'post') return 'method-post';
      if (m === 'put' || m === 'patch') return 'method-put';
      if (m === 'delete') return 'method-delete';
      return 'method-other';
    }

    function getStatusColorClass(code) {
      if (code >= 200 && code < 300) return 'status-2xx';
      if (code >= 400 && code < 500) return 'status-4xx';
      if (code >= 500) return 'status-5xx';
      return '';
    }

    function renderState(data) {
      const proxyDot = document.getElementById('proxyDot');
      const proxyText = document.getElementById('proxyText');
      const proxyPortText = document.getElementById('proxyPortText');
      const toggleProxyBtn = document.getElementById('toggleProxyBtn');
      if (data.proxy && data.proxy.running) {
        proxyText.textContent = 'Running';
        proxyDot.className = 'status-dot online';
        proxyPortText.textContent = data.proxy.port;
        if (toggleProxyBtn) toggleProxyBtn.textContent = 'Stop Proxy';
      } else {
        proxyText.textContent = 'Off';
        proxyDot.className = 'status-dot offline';
        if (toggleProxyBtn) toggleProxyBtn.textContent = 'Start Proxy';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      const cdpPortText = document.getElementById('cdpPortText');
      const toggleCdpBtn = document.getElementById('toggleCdpBtn');
      if (data.cdp && data.cdp.attached) {
        cdpText.textContent = 'Attached';
        cdpDot.className = 'status-dot online';
        cdpPortText.textContent = data.cdp.port;
        if (toggleCdpBtn) toggleCdpBtn.textContent = 'Detach CDP';
      } else {
        cdpText.textContent = 'Off';
        cdpDot.className = 'status-dot offline';
        if (toggleCdpBtn) toggleCdpBtn.textContent = 'Attach CDP';
      }

      const stackBadge = document.getElementById('sidebarStackBadge');
      if (stackBadge) {
        if (data.projectStack && data.projectStack.frameworkDisplayName) {
          const p = data.projectStack;
          const ver = p.frameworkVersion ? ' v' + p.frameworkVersion : '';
          stackBadge.textContent = p.frameworkDisplayName + ver + ' · ' + p.primaryClient;
          stackBadge.title = p.conventions ? p.conventions.description : '';
        } else {
          stackBadge.textContent = 'TypeScript / JS';
        }
      }

      const routeList = document.getElementById('routeList');
      const routeCount = document.getElementById('routeCount');
      const routes = data.routes || [];
      routeCount.textContent = routes.length;

      if (routes.length === 0) {
        routeList.innerHTML = '<div class="empty-state">No mock routes configured.</div>';
      } else {
        routeList.innerHTML = routes.map(r => {
          const isEnabled = r.enabled !== false;
          return \`
            <div class="row-item \${!isEnabled ? 'disabled' : ''}" role="listitem" title="Click to inspect in Workbench">
              <button type="button" class="route-toggle-btn" data-id="\${escapeHtml(r.id)}" aria-pressed="\${isEnabled ? 'true' : 'false'}" aria-label="\${isEnabled ? 'Disable route' : 'Enable route'}" title="\${isEnabled ? 'Active (click to disable)' : 'Disabled (click to enable)'}">
                <span class="status-dot \${isEnabled ? 'online' : 'offline'}"></span>
              </button>
              <span class="method-badge \${getMethodClass(r.method)}">\${escapeHtml(r.method)}</span>
              <span class="url-text" title="\${escapeHtml(r.urlPattern)}">\${escapeHtml(r.urlPattern)}</span>
              <span class="meta-code \${getStatusColorClass(r.statusCode)}">\${r.statusCode}</span>
              <button type="button" class="open-browser-btn" data-url="\${escapeHtml(r.urlPattern)}" aria-label="Open endpoint in browser" title="Open in browser" style="padding: 2px 4px; height: 18px;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
            </div>
          \`;
        }).join('');

        routeList.querySelectorAll('.route-toggle-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'toggleRoute', routeId: btn.getAttribute('data-id') });
          });
        });

        routeList.querySelectorAll('.open-browser-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openEndpointInBrowser', url: btn.getAttribute('data-url') });
          });
        });

        routeList.querySelectorAll('.row-item').forEach(row => {
          row.addEventListener('click', () => {
            vscode.postMessage({ type: 'openWorkbench' });
          });
        });
      }

      const trafficList = document.getElementById('trafficList');
      const trafficCount = document.getElementById('trafficCount');
      const clearTrafficBtn = document.getElementById('clearTrafficBtn');
      const traffic = data.traffic || [];
      trafficCount.textContent = traffic.length;
      if (clearTrafficBtn) {
        clearTrafficBtn.disabled = traffic.length === 0;
      }

      if (traffic.length === 0) {
        trafficList.innerHTML = '<div class="empty-state">No intercepted requests.</div>';
      } else {
        trafficList.innerHTML = [...traffic].reverse().map(t => \`
          <div class="row-item" title="Click to inspect traffic in Workbench">
            <span class="method-badge \${getMethodClass(t.method)}">\${escapeHtml(t.method)}</span>
            <span class="url-text" title="\${escapeHtml(t.url)}">\${escapeHtml(t.url)}</span>
            <span class="meta-code"><span class="\${getStatusColorClass(t.statusCode)}">\${t.statusCode}</span> · \${t.durationMs}ms</span>
          </div>
        \`).join('');

        trafficList.querySelectorAll('.row-item').forEach(row => {
          row.addEventListener('click', () => {
            vscode.postMessage({ type: 'openWorkbench' });
          });
        });
      }
    }
  </script>
</body>
</html>`;
  }
}
