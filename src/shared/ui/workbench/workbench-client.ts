
import { ICONS } from './workbench-templates';

export function getWorkbenchClientScript(nonce: string): string {
  return `
    let standaloneWs = null;
    const isVsCode = typeof acquireVsCodeApi === 'function';
    const vscode = isVsCode ? acquireVsCodeApi() : {
      postMessage: (msg) => {
        if (standaloneWs && standaloneWs.readyState === WebSocket.OPEN) {
          standaloneWs.send(JSON.stringify(msg));
        }
      }
    };

    if (!isVsCode && typeof WebSocket !== 'undefined') {
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        standaloneWs = new WebSocket(proto + '//' + window.location.host);
        standaloneWs.onopen = () => {
          standaloneWs.send(JSON.stringify({ type: 'ready' }));
        };
        standaloneWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            window.dispatchEvent(new MessageEvent('message', { data }));
          } catch (e) {}
        };
      } catch (e) {}
    }

    const ICONS = ${JSON.stringify(ICONS)};

    let state = {
      proxy: { running: false, port: 45990 },
      cdp: { attached: false, port: 9222 },
      routes: [],
      traffic: [],
      discoveredCalls: [],
      isScanning: false,
      scanError: null,
      projectConnection: { isConnected: false },
      hybridSeeder: { enabled: false, status: 'offline', recordCount: 0, sourceLabel: 'Offline Built-In' }
    };

    let activeTab = 'discovered'; // 'discovered' | 'traffic' | 'routes'
    let selectedId = null;
    let filterText = '';
    let filterMethod = 'ALL';

    const toggleHybridSeederBtn = document.getElementById('toggleHybridSeederBtn');
    const toggleConnectBtn = document.getElementById('toggleConnectBtn');
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
      tabDiscovered.setAttribute('aria-selected', 'true');
      tabTraffic.classList.remove('active');
      tabTraffic.setAttribute('aria-selected', 'false');
      tabRoutes.classList.remove('active');
      tabRoutes.setAttribute('aria-selected', 'false');
      selectedId = null;
      render();
    });

    tabTraffic.addEventListener('click', () => {
      activeTab = 'traffic';
      tabTraffic.classList.add('active');
      tabTraffic.setAttribute('aria-selected', 'true');
      tabDiscovered.classList.remove('active');
      tabDiscovered.setAttribute('aria-selected', 'false');
      tabRoutes.classList.remove('active');
      tabRoutes.setAttribute('aria-selected', 'false');
      selectedId = null;
      render();
    });

    tabRoutes.addEventListener('click', () => {
      activeTab = 'routes';
      tabRoutes.classList.add('active');
      tabRoutes.setAttribute('aria-selected', 'true');
      tabDiscovered.classList.remove('active');
      tabDiscovered.setAttribute('aria-selected', 'false');
      tabTraffic.classList.remove('active');
      tabTraffic.setAttribute('aria-selected', 'false');
      selectedId = null;
      render();
    });

    if (toggleHybridSeederBtn) {
      toggleHybridSeederBtn.addEventListener('click', () => {
        toggleHybridSeederBtn.disabled = true;
        toggleHybridSeederBtn.textContent = 'Syncing...';
        vscode.postMessage({ type: 'toggleHybridSeeder' });
      });
    }

    if (toggleConnectBtn) {
      toggleConnectBtn.addEventListener('click', () => {
        if (state.projectConnection && state.projectConnection.isConnected) {
          vscode.postMessage({ type: 'disconnectProject' });
        } else {
          vscode.postMessage({ type: 'connectProject' });
        }
      });
    }

    toggleProxyBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleProxy' }));
    toggleCdpBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleCdp' }));
    scanBtn.addEventListener('click', () => {
      state.isScanning = true;
      state.scanError = null;
      render();
      vscode.postMessage({ type: 'scanWorkspace' });
    });
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
      } else if (event.data.type === 'scanStart') {
        state.isScanning = true;
        state.scanError = null;
        render();
      } else if (event.data.type === 'scanError') {
        state.isScanning = false;
        state.scanError = event.data.error;
        render();
      } else if (event.data.type === 'discoveredCalls') {
        state.isScanning = false;
        state.scanError = null;
        state.discoveredCalls = event.data.calls || [];
        document.getElementById('discoveredCount').textContent = state.discoveredCalls.length;
        render();
      }
    });

    render();
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

    function getPreviewVectorSvg(bodyText) {
      const match = (bodyText || '').match(/data:image\\/svg\\+xml[^\\s"']+/);
      if (match) return match[0];

      const lower = (bodyText || '').toLowerCase();
      let type = 'image';
      let label = 'Media Asset';
      let width = 600;
      let height = 400;

      if (lower.includes('poster')) {
        type = 'poster';
        label = 'Movie Poster';
        width = 500;
        height = 750;
      } else if (lower.includes('avatar') || lower.includes('profile')) {
        type = 'avatar';
        label = 'User Avatar';
        width = 160;
        height = 160;
      } else if (lower.includes('backdrop') || lower.includes('banner')) {
        type = 'backdrop';
        label = 'Backdrop Banner';
        width = 1280;
        height = 720;
      }

      const centerX = width / 2;
      const iconY = height * 0.42;
      const textY = height * 0.62;
      const subY = height * 0.72;

      let iconSvg = '';
      if (type === 'avatar') {
        iconSvg = '<circle cx="' + centerX + '" cy="' + (iconY - 10) + '" r="28" fill="#64748b" /><path d="M ' + (centerX - 35) + ' ' + (iconY + 36) + ' C ' + (centerX - 35) + ' ' + (iconY + 16) + ', ' + (centerX + 35) + ' ' + (iconY + 16) + ', ' + (centerX + 35) + ' ' + (iconY + 36) + ' Z" fill="#64748b" />';
      } else if (type === 'poster') {
        iconSvg = '<rect x="' + (centerX - 32) + '" y="' + (iconY - 40) + '" width="64" height="80" rx="4" fill="none" stroke="#60a5fa" stroke-width="3" /><circle cx="' + (centerX - 16) + '" cy="' + (iconY - 24) + '" r="5" fill="#60a5fa" /><circle cx="' + (centerX + 16) + '" cy="' + (iconY - 24) + '" r="5" fill="#60a5fa" /><line x1="' + (centerX - 32) + '" y1="' + iconY + '" x2="' + (centerX + 32) + '" y2="' + iconY + '" stroke="#60a5fa" stroke-width="2" /><circle cx="' + (centerX - 16) + '" cy="' + (iconY + 20) + '" r="5" fill="#60a5fa" /><circle cx="' + (centerX + 16) + '" cy="' + (iconY + 20) + '" r="5" fill="#60a5fa" />';
      } else {
        iconSvg = '<rect x="' + (centerX - 40) + '" y="' + (iconY - 28) + '" width="80" height="56" rx="6" fill="none" stroke="#94a3b8" stroke-width="3" /><circle cx="' + (centerX - 18) + '" cy="' + (iconY - 10) + '" r="7" fill="#94a3b8" /><path d="M ' + (centerX - 32) + ' ' + (iconY + 20) + ' L ' + (centerX - 6) + ' ' + (iconY - 2) + ' L ' + (centerX + 14) + ' ' + (iconY + 14) + ' L ' + (centerX + 32) + ' ' + (iconY + 6) + '" fill="none" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />';
      }

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f172a" /><stop offset="100%" stop-color="#1e293b" /></linearGradient></defs><rect width="100%" height="100%" fill="url(#grad)" /><rect x="2" y="2" width="' + (width - 4) + '" height="' + (height - 4) + '" fill="none" stroke="#334155" stroke-width="2" rx="4" />' + iconSvg + '<text x="' + centerX + '" y="' + textY + '" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="' + Math.max(12, Math.floor(width * 0.045)) + '" fill="#f8fafc" font-weight="600" text-anchor="middle">' + label + '</text><text x="' + centerX + '" y="' + subY + '" font-family="monospace" font-size="' + Math.max(10, Math.floor(width * 0.028)) + '" fill="#64748b" text-anchor="middle">' + width + 'x' + height + ' [MockScope Offline]</text></svg>';

      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function syntaxHighlightJson(json) {
      if (typeof json !== 'string') {
        try {
          json = JSON.stringify(json, null, 2);
        } catch (e) {
          json = String(json);
        }
      }
      const safe = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return safe.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
        let cls = 'number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'key';
          } else {
            cls = 'string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'boolean';
        } else if (/null/.test(match)) {
          cls = 'null';
        }
        return '<span class="json-token-' + cls + '">' + match + '</span>';
      });
    }

    function updatePayloadMetrics(text) {
      const metricsEl = document.getElementById('payloadMetrics');
      if (!metricsEl) return;
      const str = typeof text === 'string' ? text : JSON.stringify(text || '', null, 2);
      const bytes = new Blob([str]).size;
      const kb = (bytes / 1024).toFixed(1);
      const lines = str.split(String.fromCharCode(10)).length;
      metricsEl.textContent = kb + ' KB • ' + lines + ' lines';
    }

    function getScenarioDescription(sc) {
      switch (sc) {
        case 'ok200': return 'Populated 200 OK: Full realistic data structure synthesized from TypeScript contracts with valid offline media.';
        case 'loading200': return 'Loading State: Populated 200 OK response with simulated 2000ms latency to test frontend spinners, suspense boundaries, and skeleton loaders.';
        case 'empty200': return 'Empty 200 OK: Zero-results collection structure (e.g. empty results array) to test frontend zero-data states and empty views.';
        case 'mfa200': return '2FA Challenge 200: Two-factor authentication required. Frontend displays TOTP code entry form.';
        case 'unauth401': return '401 Unauthorized: Bearer token rejected or expired. Frontend triggers session refresh or login screen.';
        case 'forbidden403': return '403 Forbidden: Insufficient role permissions. Frontend displays access denied message.';
        case 'notFound404': return '404 Not Found: Resource missing error to test frontend not-found pages, 404 alert banners, and recovery paths.';
        case 'bad400': return '400 Bad Request: Field validation error payload to test frontend form validation states and error messages.';
        case 'rateLimit429': return '429 Rate Limit: Upstream rate limit reached. Frontend displays retry backoff alert.';
        case 'server500': return '500 Server Error: Internal server exception to test frontend error boundaries and alerts.';
        case 'empty204': return '204 No Content: Successful response with empty body to test frontend zero-data actions.';
        default: return 'Custom Mock Response: Configured status code and payload.';
      }
    }

    const resizer = document.getElementById('paneResizer');
    const leftPane = document.querySelector('.left-pane');
    let isResizing = false;

    try {
      const savedState = vscode.getState() || {};
      if (savedState && savedState.leftPaneWidth && leftPane) {
        leftPane.style.width = savedState.leftPaneWidth + 'px';
      }
    } catch (e) {}

    if (resizer && leftPane) {
      resizer.addEventListener('mousedown', () => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(280, Math.min(e.clientX, window.innerWidth - 360));
        leftPane.style.width = newWidth + 'px';
        try {
          const st = vscode.getState() || {};
          vscode.setState({ ...st, leftPaneWidth: newWidth });
        } catch (err) {}
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT'
      );

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const saveBtn = document.getElementById('saveRouteBtn');
        if (saveBtn) {
          saveBtn.click();
        }
        return;
      }

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        const searchInput = document.getElementById('filterInput');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (activeEl && activeEl.id === 'filterInput') {
          activeEl.value = '';
          filterText = '';
          activeEl.blur();
          renderList();
        }
        return;
      }

      if (!isInputFocused) {
        let currentItems = [];
        if (activeTab === 'discovered') {
          currentItems = (state.discoveredCalls || []).filter(c => {
            const matchUrl = c.url.toLowerCase().includes(filterText);
            const matchMethod = filterMethod === 'ALL' || c.method.toUpperCase() === filterMethod;
            return matchUrl && matchMethod;
          });
        } else if (activeTab === 'traffic') {
          currentItems = (state.traffic || []).filter(t => {
            const matchUrl = t.url.toLowerCase().includes(filterText);
            const matchMethod = filterMethod === 'ALL' || t.method.toUpperCase() === filterMethod;
            return matchUrl && matchMethod;
          });
        } else {
          currentItems = (state.routes || []).filter(r => {
            const matchUrl = r.urlPattern.toLowerCase().includes(filterText);
            const matchMethod = filterMethod === 'ALL' || r.method.toUpperCase() === filterMethod;
            return matchUrl && matchMethod;
          });
        }

        if (currentItems.length > 0) {
          const currentIdx = currentItems.findIndex(item => item.id === selectedId);
          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault();
            const nextIdx = currentIdx < currentItems.length - 1 ? currentIdx + 1 : 0;
            selectedId = currentItems[nextIdx].id;
            render();
          } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : currentItems.length - 1;
            selectedId = currentItems[prevIdx].id;
            render();
          }
        }
      }
    });

    function render() {
      const seederDot = document.getElementById('seederDot');
      const seederText = document.getElementById('seederText');
      const modeBadge = document.getElementById('modeBadge');
      const hs = state.hybridSeeder || { enabled: false, status: 'offline', sourceLabel: 'Offline Built-In' };
      if (toggleHybridSeederBtn) {
        toggleHybridSeederBtn.disabled = false;
      }
      if (hs.enabled) {
        if (seederText) seederText.textContent = hs.status === 'synced' ? 'Hybrid (' + (hs.recordCount || 48) + ')' : 'Fallback';
        if (seederDot) seederDot.className = hs.status === 'synced' ? 'status-dot online' : 'status-dot warning';
        if (toggleHybridSeederBtn) toggleHybridSeederBtn.textContent = 'Disable';
        if (modeBadge) modeBadge.textContent = 'Hybrid';
      } else {
        if (seederText) seederText.textContent = 'Built-In';
        if (seederDot) seederDot.className = 'status-dot offline';
        if (toggleHybridSeederBtn) toggleHybridSeederBtn.textContent = 'Hybrid API';
        if (modeBadge) modeBadge.textContent = 'Offline';
      }

      const connectDot = document.getElementById('connectDot');
      const connectText = document.getElementById('connectText');
      const conn = state.projectConnection;
      if (conn && conn.isConnected) {
        if (connectText) connectText.textContent = conn.strategy ? conn.strategy.toUpperCase() : 'On';
        if (connectDot) connectDot.className = 'status-dot online';
        if (toggleConnectBtn) {
          toggleConnectBtn.textContent = 'Disconnect';
          toggleConnectBtn.title = 'Disconnect app proxy and restore original config';
        }
      } else {
        if (connectText) connectText.textContent = 'Off';
        if (connectDot) connectDot.className = 'status-dot offline';
        if (toggleConnectBtn) {
          toggleConnectBtn.textContent = 'Connect';
          toggleConnectBtn.title = 'Connect dev server to MockScope (Vite, Next, Angular, Nuxt)';
        }
      }

      const proxyDot = document.getElementById('proxyDot');
      const proxyText = document.getElementById('proxyText');
      if (state.proxy.running) {
        proxyText.textContent = ':' + state.proxy.port;
        proxyDot.className = 'status-dot online';
        toggleProxyBtn.textContent = 'Stop';
      } else {
        proxyText.textContent = 'Off';
        proxyDot.className = 'status-dot offline';
        toggleProxyBtn.textContent = 'Start';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      if (state.cdp.attached) {
        cdpText.textContent = ':' + state.cdp.port;
        cdpDot.className = 'status-dot online';
        toggleCdpBtn.textContent = 'Detach';
      } else {
        cdpText.textContent = 'Off';
        cdpDot.className = 'status-dot offline';
        toggleCdpBtn.textContent = 'Attach';
      }

      if (state.isScanning) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = ICONS.refresh + ' <span>Scanning...</span>';
      } else {
        scanBtn.disabled = false;
        scanBtn.innerHTML = ICONS.refresh + ' <span>Scan</span>';
      }

      document.getElementById('discoveredCount').textContent = (state.discoveredCalls || []).length;
      document.getElementById('trafficCount').textContent = state.traffic.length;
      document.getElementById('routeCount').textContent = state.routes.length;

      const stack = state.projectStack;
      const stackBadge = document.getElementById('stackBadge');
      if (stackBadge) {
        if (stack && stack.frameworkDisplayName) {
          const ver = stack.frameworkVersion ? ' v' + stack.frameworkVersion : '';
          stackBadge.textContent = stack.frameworkDisplayName + ver + ' • ' + stack.primaryClient + ' • ' + (stack.hasTypeScript ? 'TypeScript' : 'JS');
          stackBadge.title = stack.conventions ? stack.conventions.description : '';
        } else {
          stackBadge.textContent = 'TypeScript / JS';
        }
      }

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
        if (state.isScanning) {
          const loadingBanner = document.createElement('div');
          loadingBanner.className = 'banner-bar';
          loadingBanner.innerHTML = \`
            <span style="display: flex; align-items: center; gap: 6px;">
              <span class="status-dot online"></span>
              <span>Scanning workspace AST...</span>
            </span>
          \`;
          itemList.appendChild(loadingBanner);

          for (let i = 0; i < 3; i++) {
            const skel = document.createElement('div');
            skel.className = 'list-card skeleton-card';
            skel.innerHTML = \`
              <div class="card-top">
                <div class="skeleton-line" style="width: \${44 + i * 8}px;"></div>
                <div class="skeleton-line" style="width: \${170 + i * 25}px;"></div>
              </div>
              <div class="card-sub" style="margin-top: 6px;">
                <div class="skeleton-line" style="width: 120px;"></div>
                <div class="skeleton-line" style="width: 60px;"></div>
              </div>
            \`;
            itemList.appendChild(skel);
          }
          return;
        }

        if (state.scanError) {
          const errorPrompt = document.createElement('div');
          errorPrompt.className = 'empty-prompt';
          errorPrompt.style.padding = '30px 10px';
          errorPrompt.innerHTML = \`
            <div class="empty-icon-wrapper" style="border-color: var(--danger); color: var(--danger);">\${ICONS.trash}</div>
            <strong style="color: #fff;">AST Workspace Scan Failed</strong>
            <span style="max-width: 280px; font-size: 11px; color: var(--danger);">\${state.scanError}</span>
            <button id="retryScanBtn" class="primary btn-compact" nonce="${nonce}" style="margin-top: 6px;">
              \${ICONS.search}
              <span>Retry Scan</span>
            </button>
          \`;
          errorPrompt.querySelector('#retryScanBtn').addEventListener('click', () => {
            scanBtn.click();
          });
          itemList.appendChild(errorPrompt);
          return;
        }

        const calls = state.discoveredCalls || [];
        const filtered = calls.filter(c => {
          const matchUrl = c.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || c.method.toUpperCase() === filterMethod;
          return matchUrl && matchMethod;
        });

        if (calls.length > 0) {
          const banner = document.createElement('div');
          banner.className = 'banner-bar';
          const isConn = state.projectConnection && state.projectConnection.isConnected;
          const unmockedCalls = calls.filter(call =>
            !state.routes.some(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'))
          );
          const allMocked = calls.length > 0 && unmockedCalls.length === 0;
          const someMocked = unmockedCalls.length > 0 && unmockedCalls.length < calls.length;

          let mockBtnText = 'Auto-Mock All (' + calls.length + ')';
          let mockBtnIcon = ICONS.wand;
          let mockBtnClass = 'accent btn-compact';
          let mockBtnTitle = 'Auto-generate realistic mock responses for all discovered endpoints';

          if (allMocked) {
            mockBtnText = 'Regenerate All';
            mockBtnIcon = ICONS.refresh;
            mockBtnClass = 'secondary btn-compact';
            mockBtnTitle = 'All endpoints are already mocked. Click to regenerate with fresh synthetic data.';
          } else if (someMocked) {
            mockBtnText = 'Mock Remaining (' + unmockedCalls.length + ')';
            mockBtnIcon = ICONS.wand;
            mockBtnClass = 'accent btn-compact';
            mockBtnTitle = 'Generate mocks for the ' + unmockedCalls.length + ' unmocked endpoints';
          }

          banner.innerHTML = \`
            <span><strong>\${calls.length}</strong> endpoints</span>
            <div style="display: flex; gap: 6px; align-items: center;">
              \${!isConn ? \`
                <button id="connectProjectBannerBtn" class="btn-compact" nonce="${nonce}" title="Connect dev server to MockScope">
                  <span>Connect App</span>
                </button>
              \` : \`
                <span class="mock-status-pill mocked">\${ICONS.check} Connected</span>
              \`}
              <button id="mockAllBtn" class="\${mockBtnClass}" nonce="${nonce}" title="\${mockBtnTitle}">
                \${mockBtnIcon}
                <span>\${mockBtnText}</span>
              </button>
            </div>
          \`;
          itemList.appendChild(banner);

          const connectBannerBtn = banner.querySelector('#connectProjectBannerBtn');
          if (connectBannerBtn) {
            connectBannerBtn.addEventListener('click', () => {
              vscode.postMessage({ type: 'connectProject' });
            });
          }

          banner.querySelector('#mockAllBtn').addEventListener('click', () => {
            vscode.postMessage({ 
              type: 'mockAllCalls', 
              calls: state.discoveredCalls,
              force: allMocked
            });
          });
        }

        if (calls.length > 0 && filtered.length === 0) {
          const emptyFilter = document.createElement('div');
          emptyFilter.className = 'empty-prompt';
          emptyFilter.style.padding = '30px 10px';
          emptyFilter.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.search}</div>
            <strong style="color: #fff;">No matching endpoints</strong>
            <span style="max-width: 280px; font-size: 11px;">No detected endpoints match your filter "<strong>\${filterText}</strong>".</span>
            <button id="clearSearchBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearSearchBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            renderList();
          });
          itemList.appendChild(emptyFilter);
          return;
        }

        if (calls.length === 0) {
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

        if (state.traffic.length > 0 && filtered.length === 0) {
          const emptyFilter = document.createElement('div');
          emptyFilter.className = 'empty-prompt';
          emptyFilter.style.padding = '30px 10px';
          emptyFilter.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.search}</div>
            <strong style="color: #fff;">No matching traffic</strong>
            <span style="max-width: 280px; font-size: 11px;">No recorded requests match "<strong>\${filterText}</strong>".</span>
            <button id="clearTrafficFilterBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearTrafficFilterBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            renderList();
          });
          itemList.appendChild(emptyFilter);
          return;
        }

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

        if (state.routes.length > 0 && filtered.length === 0 && selectedId !== 'NEW_ROUTE') {
          const emptyFilter = document.createElement('div');
          emptyFilter.className = 'empty-prompt';
          emptyFilter.style.padding = '30px 10px';
          emptyFilter.innerHTML = \`
            <div class="empty-icon-wrapper">\${ICONS.search}</div>
            <strong style="color: #fff;">No matching mock routes</strong>
            <span style="max-width: 280px; font-size: 11px;">No active routes match "<strong>\${filterText}</strong>".</span>
            <button id="clearRoutesFilterBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearRoutesFilterBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            renderList();
          });
          itemList.appendChild(emptyFilter);
          return;
        }

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
            <strong style="color: var(--fg); font-size: 13px; font-weight: 600;">No Endpoint Selected</strong>
            <span style="font-size: 12px; color: var(--muted); max-width: 360px;">Select an endpoint or route from the list to inspect contracts, switch test scenarios, or edit JSON payloads.</span>
            <div class="feature-pills">
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.wand} <strong>Type Synthesis</strong></div>
                <span>Derives payloads from TypeScript generics and control-flow predicates.</span>
              </div>
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.activity} <strong>Stateful Proxy</strong></div>
                <span>Persists CRUD mutations and cross-endpoint foreign keys on 127.0.0.1.</span>
              </div>
              <div class="feature-card">
                <div class="feature-card-header">\${ICONS.code} <strong>Test Exporter</strong></div>
                <span>Exports Playwright page.route() and MSW v2 handlers.</span>
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
              <div class="json-formatted-view">\${syntaxHighlightJson(item.responseBody || '(empty body)')}</div>
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
                  <option value="403" \${route.statusCode === 403 ? 'selected' : ''}>403 Forbidden</option>
                  <option value="404" \${route.statusCode === 404 ? 'selected' : ''}>404 Not Found</option>
                  <option value="429" \${route.statusCode === 429 ? 'selected' : ''}>429 Rate Limit</option>
                  <option value="500" \${route.statusCode === 500 ? 'selected' : ''}>500 Server Error</option>
                </select>
              </div>
              <div class="form-group" style="width: 140px;">
                <label>Status</label>
                <input type="text" readonly value="\${route.enabled !== false ? 'Active Mock' : 'Disabled'}" nonce="${nonce}">
              </div>
            </div>

            <details class="advanced-accordion">
              <summary>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span>Advanced Network Latency & Metadata</span>
              </summary>
              <div class="advanced-content">
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label>Simulated Latency (ms)</label>
                    <input type="number" id="editDelayMs" min="0" step="50" value="\${route.delayMs || 0}" nonce="${nonce}">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label>Route Source</label>
                    <input type="text" readonly value="\${route.source || 'manual'}" nonce="${nonce}">
                  </div>
                </div>
              </div>
            </details>

            \${route.variants ? \`
              <div class="form-group">
                <label>Frontend UI Test States & Scenarios</label>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button type="button" class="btn-compact scenario-btn \${(!route.scenario || route.scenario === 'ok200') ? 'btn-success' : ''}" data-scenario="ok200" nonce="${nonce}" title="Populated Success State">200 Populated</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'loading200' ? 'btn-success' : ''}" data-scenario="loading200" nonce="${nonce}" title="Simulated 2000ms Latency for Testing Loaders">Loading (2s Delay)</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'empty200' ? 'btn-success' : ''}" data-scenario="empty200" nonce="${nonce}" title="Empty Collection Zero-State">Empty State (0 items)</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'bad400' ? 'btn-success' : ''}" data-scenario="bad400" nonce="${nonce}">400 Bad Request</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'unauth401' ? 'btn-success' : ''}" data-scenario="unauth401" nonce="${nonce}">401 Unauthorized</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'forbidden403' ? 'btn-success' : ''}" data-scenario="forbidden403" nonce="${nonce}">403 Forbidden</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'notFound404' ? 'btn-success' : ''}" data-scenario="notFound404" nonce="${nonce}">404 Not Found</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'rateLimit429' ? 'btn-success' : ''}" data-scenario="rateLimit429" nonce="${nonce}">429 Rate Limit</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'server500' ? 'btn-success' : ''}" data-scenario="server500" nonce="${nonce}">500 Error</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'empty204' ? 'btn-success' : ''}" data-scenario="empty204" nonce="${nonce}">204 No Content</button>
                </div>
                <div id="scenarioHelpNote" class="scenario-help-note" style="margin-top: 6px;">\${getScenarioDescription(route.scenario || 'ok200')}</div>
              </div>
            \` : ''}

            \${(bodyStr.includes('data:image/svg+xml') || bodyStr.includes('poster') || bodyStr.includes('avatar') || bodyStr.includes('image') || bodyStr.includes('backdrop') || bodyStr.includes('banner')) ? \`
              <div class="form-group">
                <label>Offline Media Asset Preview (Zero Network Egress)</label>
                <div style="display: flex; gap: 12px; align-items: center; background: var(--bg); padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
                  <img id="mediaPreviewImg" src="\${getPreviewVectorSvg(bodyStr)}" style="max-height: 80px; max-width: 120px; border-radius: 4px; border: 1px solid var(--border); background: #0f172a;" alt="Media Preview" />
                  <div style="font-size: 11px; color: var(--muted); display: flex; flex-direction: column; gap: 3px;">
                    <strong style="color: #fff;">Offline Vector Placeholder</strong>
                    <span>Embedded SVG vector assets generated locally without external telemetry or remote CDN dependencies. Never 404s.</span>
                  </div>
                </div>
              </div>
            \` : ''}

            \${(route.urlPattern.includes('auth') || route.urlPattern.includes('2fa') || route.urlPattern.includes('login') || bodyStr.includes('mfaRequired') || bodyStr.includes('twoFactor')) ? \`
              <div class="info-callout" style="border-left-color: #3fb950; background: rgba(63, 185, 80, 0.08);">
                <strong>Interactive 2FA / Authentication Sandbox:</strong> This endpoint supports stateful two-factor verification. Send a POST with <code>{ "code": "123456" }</code> to verify, or <code>{ "code": "000000" }</code> to test authentication rejection.
              </div>
            \` : ''}

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted);">Response Body</span>
                  <span id="payloadMetrics" class="metric-pill">0.0 KB • 0 lines</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div class="editor-mode-toggle">
                    <button type="button" id="viewFormattedBtn" class="active" nonce="${nonce}">Visual</button>
                    <button type="button" id="viewRawBtn" nonce="${nonce}">Raw</button>
                  </div>
                  <button type="button" id="formatJsonBtn" class="btn-compact" nonce="${nonce}">Format</button>
                  <button type="button" id="copyInspectorBodyBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
                </div>
              </div>
              <div id="formattedBodyContainer" class="json-formatted-view" title="Click to edit raw JSON">\${syntaxHighlightJson(bodyStr)}</div>
              <textarea id="editBody" class="json-editor" style="display: none;" nonce="${nonce}">\${bodyStr}</textarea>
              <div id="jsonErrorBanner" class="error-banner" style="display: none; margin-top: 6px;"></div>
            </div>
          </div>
        \`;

        updatePayloadMetrics(bodyStr);

        const viewFormattedBtn = document.getElementById('viewFormattedBtn');
        const viewRawBtn = document.getElementById('viewRawBtn');
        const formattedContainer = document.getElementById('formattedBodyContainer');
        const editBody = document.getElementById('editBody');
        const mediaPreviewImg = document.getElementById('mediaPreviewImg');

        if (viewFormattedBtn && viewRawBtn && formattedContainer && editBody) {
          viewFormattedBtn.addEventListener('click', () => {
            viewFormattedBtn.classList.add('active');
            viewRawBtn.classList.remove('active');
            formattedContainer.innerHTML = syntaxHighlightJson(editBody.value);
            formattedContainer.style.display = 'block';
            editBody.style.display = 'none';
          });

          viewRawBtn.addEventListener('click', () => {
            viewRawBtn.classList.add('active');
            viewFormattedBtn.classList.remove('active');
            formattedContainer.style.display = 'none';
            editBody.style.display = 'block';
            editBody.focus();
          });

          formattedContainer.addEventListener('click', () => {
            viewRawBtn.click();
          });

          editBody.addEventListener('input', () => {
            updatePayloadMetrics(editBody.value);
            const errorBanner = document.getElementById('jsonErrorBanner');
            const saveBtn = document.getElementById('saveRouteBtn');
            try {
              JSON.parse(editBody.value);
              editBody.style.borderColor = 'var(--input-border)';
              if (errorBanner) errorBanner.style.display = 'none';
              if (saveBtn) saveBtn.disabled = false;
              formattedContainer.innerHTML = syntaxHighlightJson(editBody.value);
              if (mediaPreviewImg) {
                mediaPreviewImg.src = getPreviewVectorSvg(editBody.value);
              }
            } catch (err) {
              editBody.style.borderColor = 'var(--danger)';
              if (saveBtn) saveBtn.disabled = true;
              if (errorBanner) {
                errorBanner.textContent = 'JSON Syntax Error: ' + err.message;
                errorBanner.style.display = 'flex';
              }
            }
          });
        }

        const copyInspectorBodyBtn = document.getElementById('copyInspectorBodyBtn');
        if (copyInspectorBodyBtn && editBody) {
          copyInspectorBodyBtn.addEventListener('click', () => {
            copyWithFeedback(copyInspectorBodyBtn, editBody.value, 'Response Body');
          });
        }

        document.querySelectorAll('.scenario-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const sc = btn.getAttribute('data-scenario');
            if (route.variants && route.variants[sc]) {
              const v = route.variants[sc];
              route.scenario = sc;
              document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('btn-success'));
              btn.classList.add('btn-success');
              const statusEl = document.getElementById('editStatusCode');
              if (statusEl) statusEl.value = String(v.statusCode);
              if (editBody) {
                editBody.value = v.rawBody;
                editBody.style.borderColor = 'var(--input-border)';
              }
              const errorBanner = document.getElementById('jsonErrorBanner');
              if (errorBanner) errorBanner.style.display = 'none';
              const saveBtn = document.getElementById('saveRouteBtn');
              if (saveBtn) saveBtn.disabled = false;
              if (formattedContainer) formattedContainer.innerHTML = syntaxHighlightJson(v.rawBody);
              const noteEl = document.getElementById('scenarioHelpNote');
              if (noteEl) noteEl.textContent = getScenarioDescription(sc);
              if (mediaPreviewImg) mediaPreviewImg.src = getPreviewVectorSvg(v.rawBody);
              updatePayloadMetrics(v.rawBody);

              const delayInput = document.getElementById('editDelayMs');
              if (sc === 'loading200') {
                if (delayInput) delayInput.value = '2000';
                route.delayMs = 2000;
              } else if (route.delayMs === 2000) {
                if (delayInput) delayInput.value = '0';
                route.delayMs = 0;
              }

              vscode.postMessage({ type: 'switchRouteScenario', routeId: route.id, scenario: sc });
            }
          });
        });

        const formatBtn = document.getElementById('formatJsonBtn');
        if (formatBtn && editBody) {
          formatBtn.addEventListener('click', () => {
            const errorBanner = document.getElementById('jsonErrorBanner');
            const saveBtn = document.getElementById('saveRouteBtn');
            try {
              const parsed = JSON.parse(editBody.value);
              const pretty = JSON.stringify(parsed, null, 2);
              editBody.value = pretty;
              editBody.style.borderColor = 'var(--input-border)';
              if (errorBanner) errorBanner.style.display = 'none';
              if (saveBtn) saveBtn.disabled = false;
              if (formattedContainer) formattedContainer.innerHTML = syntaxHighlightJson(pretty);
              updatePayloadMetrics(pretty);
            } catch (err) {
              if (errorBanner) {
                errorBanner.textContent = 'Cannot format invalid JSON: ' + err.message;
                errorBanner.style.display = 'flex';
              }
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
          } catch (err) {
            const errorBanner = document.getElementById('jsonErrorBanner');
            if (errorBanner) {
              errorBanner.textContent = 'Cannot save route: Invalid JSON syntax (' + err.message + ')';
              errorBanner.style.display = 'flex';
            }
            return;
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
  `;
}
