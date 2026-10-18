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
    private readonly onOpenWorkbench: () => void
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
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 12px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      font-size: 12px;
      margin: 0;
    }
    .header-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .status-badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
    }
    .status-on {
      background-color: #107c41;
      color: #ffffff;
    }
    .status-off {
      background-color: #5a5a5a;
      color: #ffffff;
    }
    .button-group {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 5px 10px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.15s ease;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .section-title {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      margin: 14px 0 6px 0;
      color: var(--vscode-descriptionForeground);
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
      background: var(--vscode-editorWidget-background, #1e1e1e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 4px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
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
    }
    .method-get { background: #007acc; color: #fff; }
    .method-post { background: #4ec9b0; color: #111; }
    .method-put { background: #dcdcaa; color: #111; }
    .method-delete { background: #f14c4c; color: #fff; }
    .method-other { background: #888; color: #fff; }
    .url-text {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      word-break: break-all;
    }
    .badge-mock {
      background: #73c991;
      color: #0b2212;
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 2px;
      font-weight: bold;
    }
    .empty-state {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="header-panel">
    <div class="status-row">
      <span><strong>Proxy (127.0.0.1)</strong>: <span id="proxyPortText">45990</span></span>
      <span id="proxyBadge" class="status-badge status-off">OFF</span>
    </div>
    <div class="status-row">
      <span><strong>Browser CDP</strong>: <span id="cdpPortText">9222</span></span>
      <span id="cdpBadge" class="status-badge status-off">DETACHED</span>
    </div>
    <div class="button-group">
      <button id="openWorkbenchBtn" nonce="${nonce}" style="background: #007acc; font-weight: bold;">🚀 Open Workbench</button>
      <button id="toggleProxyBtn" nonce="${nonce}">Toggle Proxy</button>
      <button id="toggleCdpBtn" nonce="${nonce}">Toggle CDP</button>
      <button id="clearTrafficBtn" nonce="${nonce}">Clear</button>
    </div>
  </div>

  <div class="section-title">
    <span>Mock Routes (<span id="routeCount">0</span>)</span>
  </div>
  <div id="routeList" class="item-list">
    <div class="empty-state">No mock routes configured. Click '⚡ Mock API' in code to add.</div>
  </div>

  <div class="section-title">
    <span>Live Traffic Ledger (<span id="trafficCount">0</span>/100)</span>
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
      const proxyBadge = document.getElementById('proxyBadge');
      const proxyPortText = document.getElementById('proxyPortText');
      if (data.proxy && data.proxy.running) {
        proxyBadge.textContent = 'RUNNING';
        proxyBadge.className = 'status-badge status-on';
        proxyPortText.textContent = data.proxy.port;
      } else {
        proxyBadge.textContent = 'OFF';
        proxyBadge.className = 'status-badge status-off';
      }

      const cdpBadge = document.getElementById('cdpBadge');
      const cdpPortText = document.getElementById('cdpPortText');
      if (data.cdp && data.cdp.attached) {
        cdpBadge.textContent = 'ATTACHED';
        cdpBadge.className = 'status-badge status-on';
        cdpPortText.textContent = data.cdp.port;
      } else {
        cdpBadge.textContent = 'DETACHED';
        cdpBadge.className = 'status-badge status-off';
      }

      const routeList = document.getElementById('routeList');
      const routeCount = document.getElementById('routeCount');
      const routes = data.routes || [];
      routeCount.textContent = routes.length;

      if (routes.length === 0) {
        routeList.innerHTML = '<div class="empty-state">No mock routes configured. Click ⚡ Mock API in code to add.</div>';
      } else {
        routeList.innerHTML = routes.map(r => \`
          <div class="card">
            <div class="card-row">
              <span class="method-badge \${getMethodClass(r.method)}">\${r.method}</span>
              <span class="url-text">\${r.urlPattern}</span>
              <span>\${r.statusCode}</span>
            </div>
          </div>
        \`).join('');
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
              <div>
                <span class="method-badge \${getMethodClass(t.method)}">\${t.method}</span>
                \${t.isMocked ? '<span class="badge-mock">MOCKED</span>' : ''}
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
