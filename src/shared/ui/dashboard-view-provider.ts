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
      --border: var(--vscode-panel-border, #27272a);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.04));
      --btn-bg: var(--vscode-button-background, #2563eb);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1d4ed8);
      --ui-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      --code-font: var(--vscode-editor-font-family, Consolas, monospace);
      --success: #22c55e;
    }
    body {
      font-family: var(--ui-font);
      padding: 12px;
      color: var(--fg);
      background-color: var(--bg);
      font-size: 12px;
      margin: 0;
      line-height: 1.4;
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
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.online { background-color: var(--success); }
    .status-dot.offline { background-color: #52525b; }
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
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.1s ease, border-color 0.1s ease;
    }
    button:hover {
      background: var(--hover-bg);
      border-color: var(--muted);
    }
    button.primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border-color: transparent;
    }
    button.primary:hover {
      background: var(--btn-hover);
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
    }
    .row-item:hover {
      background: var(--hover-bg);
    }
    .method-badge {
      font-weight: 600;
      font-size: 11px;
      width: 38px;
      font-family: var(--code-font);
      flex-shrink: 0;
    }
    .method-get { color: #60a5fa; }
    .method-post { color: #4ade80; }
    .method-put { color: #facc15; }
    .method-delete { color: #f87171; }
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
    .empty-state {
      color: var(--muted);
      padding: 8px 0;
      font-size: 11px;
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
          <path d="M9.75 8.5C8.5 8.5 8.25 9.25 8.25 10.25V11C8.25 11.55 7.65 12 7 12C7.65 12 8.25 12.45 8.25 13V13.75C8.25 14.75 8.5 15.5 9.75 15.5" stroke="#F4F4F5" stroke-width="1.85"/>
          <path d="M14.25 8.5C15.5 8.5 15.75 9.25 15.75 10.25V11C15.75 11.55 16.35 12 17 12C16.35 12 15.75 12.45 15.75 13V13.75C15.75 14.75 15.5 15.5 14.25 15.5" stroke="#F4F4F5" stroke-width="1.85"/>
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
      <button type="button" id="openWorkbenchBtn" class="primary" nonce="${nonce}" title="Open MockScope">
        <span>Open</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button type="button" id="toggleProxyBtn" nonce="${nonce}">Proxy</button>
      <button type="button" id="toggleCdpBtn" nonce="${nonce}">CDP</button>
      <button type="button" id="clearTrafficBtn" nonce="${nonce}">Clear</button>
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

    function renderState(data) {
      const proxyDot = document.getElementById('proxyDot');
      const proxyText = document.getElementById('proxyText');
      const proxyPortText = document.getElementById('proxyPortText');
      if (data.proxy && data.proxy.running) {
        proxyText.textContent = 'Running';
        proxyDot.className = 'status-dot online';
        proxyPortText.textContent = data.proxy.port;
      } else {
        proxyText.textContent = 'Off';
        proxyDot.className = 'status-dot offline';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      const cdpPortText = document.getElementById('cdpPortText');
      if (data.cdp && data.cdp.attached) {
        cdpText.textContent = 'Attached';
        cdpDot.className = 'status-dot online';
        cdpPortText.textContent = data.cdp.port;
      } else {
        cdpText.textContent = 'Off';
        cdpDot.className = 'status-dot offline';
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
        routeList.innerHTML = routes.map(r => \`
          <div class="row-item">
            <span class="method-badge \${getMethodClass(r.method)}">\${r.method}</span>
            <span class="url-text" title="\${r.urlPattern}">\${r.urlPattern}</span>
            <span class="meta-code">\${r.statusCode}</span>
            <button class="open-browser-btn" data-url="\${r.urlPattern}" title="Open in browser" style="padding: 2px 4px; height: 18px;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </button>
          </div>
        \`).join('');

        routeList.querySelectorAll('.open-browser-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openEndpointInBrowser', url: btn.getAttribute('data-url') });
          });
        });
      }

      const trafficList = document.getElementById('trafficList');
      const trafficCount = document.getElementById('trafficCount');
      const traffic = data.traffic || [];
      trafficCount.textContent = traffic.length;

      if (traffic.length === 0) {
        trafficList.innerHTML = '<div class="empty-state">No intercepted requests.</div>';
      } else {
        trafficList.innerHTML = [...traffic].reverse().map(t => \`
          <div class="row-item">
            <span class="method-badge \${getMethodClass(t.method)}">\${t.method}</span>
            <span class="url-text" title="\${t.url}">\${t.url}</span>
            <span class="meta-code">\${t.statusCode} · \${t.durationMs}ms</span>
          </div>
        \`).join('');
      }
    }
  </script>
</body>
</html>`;
  }
}
