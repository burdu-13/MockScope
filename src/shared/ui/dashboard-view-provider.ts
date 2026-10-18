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
    private readonly onOpenEndpointInBrowser?: (url: string) => void
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
  <title>MockScope Dashboard</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --card-bg: var(--vscode-editorWidget-background, #252526);
      --border: var(--vscode-widget-border, #3c3c3c);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
      --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
      --accent: #007acc;
      --success: #3fb950;
      --muted: var(--vscode-descriptionForeground, #8c8c8c);
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 12px;
      color: var(--fg);
      background-color: var(--bg);
      font-size: 12px;
      margin: 0;
    }
    .header-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }
    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.online {
      background-color: var(--success);
      box-shadow: 0 0 6px rgba(63, 185, 80, 0.6);
    }
    .status-dot.offline {
      background-color: #6e7681;
    }
    .button-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    button {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid transparent;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s ease;
    }
    button:hover {
      background: var(--btn-sec-hover);
    }
    button.primary {
      background: var(--btn-bg);
      color: var(--btn-fg);
      font-weight: 600;
    }
    button.primary:hover {
      background: var(--btn-hover);
    }
    .section-title {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      margin: 14px 0 6px 0;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .item-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 250px;
      overflow-y: auto;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: border-color 0.15s ease;
    }
    .card:hover {
      border-color: #666;
    }
    .card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .method-badge {
      font-weight: 700;
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: monospace;
    }
    .method-get { background: #007acc; color: #fff; }
    .method-post { background: #238636; color: #fff; }
    .method-put { background: #b08800; color: #fff; }
    .method-delete { background: #da3633; color: #fff; }
    .method-other { background: #6e7681; color: #fff; }
    .url-text {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      word-break: break-all;
    }
    .badge-mock {
      background: rgba(63, 185, 80, 0.2);
      color: var(--success);
      border: 1px solid var(--success);
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-pass {
      background: rgba(110, 118, 129, 0.2);
      color: #8b949e;
      border: 1px solid #484f58;
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      font-weight: 500;
      text-transform: uppercase;
    }
    .empty-state {
      color: var(--muted);
      padding: 10px 0;
      font-size: 11px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="header-panel">
    <div class="status-row">
      <span><strong>Proxy (127.0.0.1)</strong>: <span id="proxyPortText">45990</span></span>
      <span class="status-indicator">
        <span id="proxyDot" class="status-dot offline"></span>
        <span id="proxyText">OFF</span>
      </span>
    </div>
    <div class="status-row">
      <span><strong>Browser CDP</strong>: <span id="cdpPortText">9222</span></span>
      <span class="status-indicator">
        <span id="cdpDot" class="status-dot offline"></span>
        <span id="cdpText">DETACHED</span>
      </span>
    </div>
    <div class="button-group">
      <button id="openWorkbenchBtn" class="primary" nonce="${nonce}" title="Open MockScope Workbench visual workbench">
        <span>Open Workbench</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </button>
      <button id="toggleProxyBtn" nonce="${nonce}">Toggle Proxy</button>
      <button id="toggleCdpBtn" nonce="${nonce}">Toggle CDP</button>
      <button id="clearTrafficBtn" nonce="${nonce}">Clear</button>
    </div>
  </div>

  <div class="section-title">
    <span>Mock Routes (<span id="routeCount">0</span>)</span>
  </div>
  <div id="routeList" class="item-list">
    <div class="empty-state">No mock routes configured. Use CodeLens or Open Workbench to configure routes.</div>
  </div>

  <div class="section-title">
    <span>Live Traffic (<span id="trafficCount">0</span>/100)</span>
  </div>
  <div id="trafficList" class="item-list">
    <div class="empty-state">No intercepted requests yet.</div>
  </div>

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
        proxyText.textContent = 'RUNNING';
        proxyDot.className = 'status-dot online';
        proxyPortText.textContent = data.proxy.port;
      } else {
        proxyText.textContent = 'OFF';
        proxyDot.className = 'status-dot offline';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      const cdpPortText = document.getElementById('cdpPortText');
      if (data.cdp && data.cdp.attached) {
        cdpText.textContent = 'ATTACHED';
        cdpDot.className = 'status-dot online';
        cdpPortText.textContent = data.cdp.port;
      } else {
        cdpText.textContent = 'DETACHED';
        cdpDot.className = 'status-dot offline';
      }

      const routeList = document.getElementById('routeList');
      const routeCount = document.getElementById('routeCount');
      const routes = data.routes || [];
      routeCount.textContent = routes.length;

      if (routes.length === 0) {
        routeList.innerHTML = '<div class="empty-state">No mock routes configured. Use CodeLens or Open Workbench to configure routes.</div>';
      } else {
        routeList.innerHTML = routes.map(r => \`
          <div class="card">
            <div class="card-row">
              <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
                <span class="method-badge \${getMethodClass(r.method)}">\${r.method}</span>
                <span class="url-text" title="\${r.urlPattern}">\${r.urlPattern}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                <span>\${r.statusCode}</span>
                <button class="open-browser-btn" data-url="\${r.urlPattern}" title="Preview mock endpoint in browser" style="padding: 2px 5px; font-size: 10px; background: transparent; border: 1px solid var(--border); border-radius: 3px;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              </div>
            </div>
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
        trafficList.innerHTML = '<div class="empty-state">No intercepted requests yet.</div>';
      } else {
        trafficList.innerHTML = [...traffic].reverse().map(t => \`
          <div class="card">
            <div class="card-row">
              <div style="display: flex; align-items: center; gap: 4px;">
                <span class="method-badge \${getMethodClass(t.method)}">\${t.method}</span>
                <span class="\${t.isMocked ? 'badge-mock' : 'badge-pass'}">\${t.isMocked ? 'MOCKED' : 'PASS'}</span>
              </div>
              <span class="url-text">\${t.url}</span>
              <span>\${t.statusCode} (\${t.durationMs}ms)</span>
            </div>
          </div>
        \`).join('');
      }
    }
  </script>
</body>
</html>`;
  }
}
