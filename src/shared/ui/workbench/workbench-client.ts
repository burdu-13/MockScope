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
    let pendingRouteTarget = null; // { method, url } when synthesizing a mock from inspector
    let filterText = '';
    let filterMethod = 'ALL';

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

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

    function setActiveTab(tab) {
      activeTab = tab;
      tabDiscovered.classList.toggle('active', tab === 'discovered');
      tabDiscovered.setAttribute('aria-selected', tab === 'discovered' ? 'true' : 'false');
      tabRoutes.classList.toggle('active', tab === 'routes');
      tabRoutes.setAttribute('aria-selected', tab === 'routes' ? 'true' : 'false');
      tabTraffic.classList.toggle('active', tab === 'traffic');
      tabTraffic.setAttribute('aria-selected', tab === 'traffic' ? 'true' : 'false');
      if (clearBtn) {
        clearBtn.title = tab === 'traffic' ? 'Clear recorded traffic ledger' : 'Clear search filter (Esc)';
      }
    }

    tabDiscovered.addEventListener('click', () => {
      setActiveTab('discovered');
      selectedId = null;
      render();
    });

    tabTraffic.addEventListener('click', () => {
      setActiveTab('traffic');
      selectedId = null;
      render();
    });

    tabRoutes.addEventListener('click', () => {
      setActiveTab('routes');
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
      if (activeTab === 'traffic' && !filterText && filterMethod === 'ALL') {
        vscode.postMessage({ type: 'clearTraffic' });
      } else {
        filterInput.value = '';
        filterText = '';
        methodFilter.value = 'ALL';
        filterMethod = 'ALL';
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
      setActiveTab('routes');
      selectedId = 'NEW_ROUTE';
      render();
    });

    window.addEventListener('message', (event) => {
      if (event.data.type === 'stateUpdate') {
        state = { ...state, ...event.data };
        if (pendingRouteTarget && Array.isArray(state.routes)) {
          const matched = state.routes.find(
            (r) =>
              r.urlPattern === pendingRouteTarget.url &&
              (r.method === pendingRouteTarget.method || r.method === '*')
          );
          if (matched) {
            setActiveTab('routes');
            selectedId = matched.id;
            pendingRouteTarget = null;
          }
        }
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
        if (saveBtn && !saveBtn.disabled) {
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
          currentItems = [...(state.traffic || [])].filter(t => {
            const matchUrl = t.url.toLowerCase().includes(filterText);
            const matchMethod = filterMethod === 'ALL' || t.method.toUpperCase() === filterMethod;
            return matchUrl && matchMethod;
          }).reverse();
        } else {
          currentItems = (state.routes || []).filter(r => {
            const matchUrl = r.urlPattern.toLowerCase().includes(filterText);
            const matchMethod = filterMethod === 'ALL' || r.method.toUpperCase() === filterMethod || r.method === '*';
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
            const selectedCard = itemList.querySelector('.list-card.selected');
            if (selectedCard && selectedCard.scrollIntoView) {
              selectedCard.scrollIntoView({ block: 'nearest' });
            }
          } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : currentItems.length - 1;
            selectedId = currentItems[prevIdx].id;
            render();
            const selectedCard = itemList.querySelector('.list-card.selected');
            if (selectedCard && selectedCard.scrollIntoView) {
              selectedCard.scrollIntoView({ block: 'nearest' });
            }
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
            <strong>AST Workspace Scan Failed</strong>
            <span style="max-width: 280px; font-size: 11px; color: var(--danger);">\${escapeHtml(state.scanError)}</span>
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
            <strong>No matching endpoints</strong>
            <span style="max-width: 280px; font-size: 11px;">No detected endpoints match your filter "<strong>\${escapeHtml(filterText)}</strong>".</span>
            <button id="clearSearchBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearSearchBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            methodFilter.value = 'ALL';
            filterMethod = 'ALL';
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
            <strong>No API calls detected yet</strong>
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
          const matchedRoute = state.routes.find(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));
          const isAlreadyMocked = Boolean(matchedRoute);
          const isSelected = selectedId === call.id;
          const card = document.createElement('div');
          card.className = 'list-card' + (isSelected ? ' selected' : '');
          card.setAttribute('role', 'option');
          card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          const filename = (call.fileName || '').split(/[\\\\/]/).pop() || '';

          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${escapeHtml(call.method)}</span>
              <span class="path-text" title="\${escapeHtml(call.url)}">\${escapeHtml(call.url)}</span>
              \${call.typeArgument ? \`<span class="type-tag" title="Generic return type: \${escapeHtml(call.typeArgument)}">&lt;\${escapeHtml(call.typeArgument)}&gt;</span>\` : ''}
            </div>
            <div class="card-sub">
              <span>\${escapeHtml(call.clientType)}\${filename ? ' in ' + escapeHtml(filename) : ''}</span>
              \${isAlreadyMocked 
                ? \`<span class="mock-status-pill mocked">\${ICONS.check} Active Mock</span>\` 
                : \`<button type="button" class="mini-mock-btn btn-compact" style="padding: 2px 7px;">\${ICONS.plus} Mock</button>\`
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
            <strong>No matching traffic</strong>
            <span style="max-width: 280px; font-size: 11px;">No recorded requests match "<strong>\${escapeHtml(filterText)}</strong>".</span>
            <button id="clearTrafficFilterBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearTrafficFilterBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            methodFilter.value = 'ALL';
            filterMethod = 'ALL';
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
            <strong>No traffic recorded yet</strong>
            <span style="max-width: 280px; font-size: 11px;">Make a request via proxy (127.0.0.1:45990) or attach CDP to record real-time requests.</span>
          \`;
          itemList.appendChild(empty);
          return;
        }

        [...filtered].reverse().forEach(t => {
          const isSelected = selectedId === t.id;
          const card = document.createElement('div');
          card.className = 'list-card' + (isSelected ? ' selected' : '');
          card.setAttribute('role', 'option');
          card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(t.method)}">\${escapeHtml(t.method)}</span>
              <span class="path-text" title="\${escapeHtml(t.url)}">\${escapeHtml(t.url)}</span>
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
            <strong>No matching mock routes</strong>
            <span style="max-width: 280px; font-size: 11px;">No active routes match "<strong>\${escapeHtml(filterText)}</strong>".</span>
            <button id="clearRoutesFilterBtn" class="btn-compact" nonce="${nonce}" style="margin-top: 6px;">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearRoutesFilterBtn').addEventListener('click', () => {
            filterInput.value = '';
            filterText = '';
            methodFilter.value = 'ALL';
            filterMethod = 'ALL';
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
            <strong>No mock routes active</strong>
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
          const isSelected = selectedId === r.id;
          const isEnabled = r.enabled !== false;
          const card = document.createElement('div');
          card.className = 'list-card' + (isSelected ? ' selected' : '') + (!isEnabled ? ' disabled-route' : '');
          card.setAttribute('role', 'option');
          card.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          card.innerHTML = \`
            <div class="card-top">
              <span class="method-tag \${getMethodTagClass(r.method)}">\${escapeHtml(r.method)}</span>
              <span class="path-text" title="\${escapeHtml(r.urlPattern)}">\${escapeHtml(r.urlPattern)}</span>
              <span class="status-code-tag \${getStatusClass(r.statusCode)}">\${r.statusCode}</span>
            </div>
            <div class="card-sub">
              <button type="button" class="route-toggle-pill" title="\${isEnabled ? 'Click to disable route' : 'Click to enable route'}" aria-pressed="\${isEnabled ? 'true' : 'false'}">
                <span class="status-dot \${isEnabled ? 'online' : 'offline'}"></span>
                <span>\${isEnabled ? 'Active' : 'Disabled'}</span>
              </button>
              <span>\${r.delayMs ? r.delayMs + 'ms delay' : 'Instant'}</span>
            </div>
          \`;
          const togglePill = card.querySelector('.route-toggle-pill');
          if (togglePill) {
            togglePill.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'toggleRoute', routeId: r.id });
            });
          }
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
        const matchedRoute = state.routes.find(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));
        const isAlreadyMocked = Boolean(matchedRoute);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${escapeHtml(call.method)}</span>
              <span class="path-display" title="\${escapeHtml(call.url)}">\${escapeHtml(call.url)}</span>
            </div>
            <div class="inspector-actions">
              \${isAlreadyMocked ? \`
                <button type="button" id="openDiscoveredInBrowserBtn" nonce="${nonce}" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open in Browser</span>
                </button>
                <button type="button" id="viewActiveRouteBtn" nonce="${nonce}" title="Inspect and edit the active mock route">
                  \${ICONS.layers}
                  <span>Edit Route</span>
                </button>
              \` : ''}
              <button type="button" id="inspectMockBtn" class="accent" nonce="${nonce}">
                \${ICONS.wand}
                <span>\${isAlreadyMocked ? 'Regenerate Mock' : 'Auto-Synthesize Mock'}</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label for="discClientInput">HTTP Client</label>
                <input type="text" id="discClientInput" readonly value="\${escapeHtml(call.clientType)}">
              </div>
              <div class="form-group" style="flex: 1;">
                <label for="discTypeInput">TypeScript Generic Return Type</label>
                <input type="text" id="discTypeInput" readonly value="\${escapeHtml(call.typeArgument || 'None (auto-inferred)')}">
              </div>
            </div>

            <div class="form-group">
              <label for="discLocInput">Source Code Location</label>
              <div class="input-with-action">
                <input type="text" id="discLocInput" readonly value="\${escapeHtml(call.fileName || 'source.ts')} (Line \${call.range.start.line + 1})">
                \${call.fileName ? \`
                  <button type="button" id="openSourceBtn" nonce="${nonce}" title="Jump to call site in VS Code editor">
                    \${ICONS.code}
                    <span>Open in Editor</span>
                  </button>
                \` : ''}
              </div>
            </div>

            <div class="form-group">
              <label>
                <span>Detected Expression in Source</span>
                <button type="button" id="copyExprBtn" class="btn-compact" nonce="${nonce}" title="Copy code expression">\${ICONS.copy} Copy</button>
              </label>
              <div class="tab-content-panel">\${escapeHtml(call.rawExpression)}</div>
            </div>

            <div class="info-callout">
              <strong>Zero-Configuration Mock Guarantee:</strong> MockScope analyzes this call site's TypeScript type <code>&lt;\${escapeHtml(call.typeArgument || 'Object')}&gt;</code> and generates matching realistic data deterministically without requiring manual schema definitions.
            </div>
          </div>
        \`;

        document.getElementById('inspectMockBtn').addEventListener('click', () => {
          pendingRouteTarget = { method: call.method, url: call.url };
          vscode.postMessage({ type: 'mockDetectedCall', call });
          if (matchedRoute) {
            setActiveTab('routes');
            selectedId = matchedRoute.id;
            render();
          }
        });

        const viewActiveRouteBtn = document.getElementById('viewActiveRouteBtn');
        if (viewActiveRouteBtn && matchedRoute) {
          viewActiveRouteBtn.addEventListener('click', () => {
            setActiveTab('routes');
            selectedId = matchedRoute.id;
            render();
          });
        }

        const openDiscoveredInBrowserBtn = document.getElementById('openDiscoveredInBrowserBtn');
        if (openDiscoveredInBrowserBtn) {
          openDiscoveredInBrowserBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'openEndpointInBrowser', url: call.url });
          });
        }

        const openSourceBtn = document.getElementById('openSourceBtn');
        if (openSourceBtn && call.fileName) {
          openSourceBtn.addEventListener('click', () => {
            vscode.postMessage({
              type: 'openSourceLocation',
              fileName: call.fileName,
              line: call.range.start.line,
              character: call.range.start.character || 0,
            });
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
              <span class="method-tag \${getMethodTagClass(item.method)}">\${escapeHtml(item.method)}</span>
              <span class="path-display" title="\${escapeHtml(item.url)}">\${escapeHtml(item.url)}</span>
              <span class="status-code-tag \${getStatusClass(item.statusCode)}">\${item.statusCode}</span>
            </div>
            <div class="inspector-actions">
              <button type="button" id="openTrafficInBrowserBtn" nonce="${nonce}" title="Preview endpoint in browser">
                \${ICONS.external}
                <span>Open in Browser</span>
              </button>
              <button type="button" id="promoteMockBtn" class="primary" nonce="${nonce}">
                \${ICONS.plus}
                <span>Convert to Mock Route</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label for="trafficLatencyInput">Status & Latency</label>
                <input type="text" id="trafficLatencyInput" readonly value="\${item.statusCode} (\${item.durationMs}ms)">
              </div>
              <div class="form-group" style="flex: 1;">
                <label for="trafficModeInput">Interception Mode</label>
                <input type="text" id="trafficModeInput" readonly value="\${item.isMocked ? 'Mocked Response' : 'Upstream Passthrough'}">
              </div>
            </div>

            <div class="form-group">
              <label>
                <span>Request Headers (Sanitized)</span>
                <button type="button" id="copyReqHdrBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
              </label>
              <div class="tab-content-panel">\${escapeHtml(JSON.stringify(item.requestHeaders, null, 2))}</div>
            </div>

            \${item.requestBody ? \`
              <div class="form-group">
                <label>Request Body</label>
                <div class="tab-content-panel">\${escapeHtml(item.requestBody)}</div>
              </div>
            \` : ''}

            <div class="form-group">
              <label>Response Headers</label>
              <div class="tab-content-panel">\${escapeHtml(JSON.stringify(item.responseHeaders, null, 2))}</div>
            </div>

            <div class="form-group">
              <label>
                <span>Response Body</span>
                <button type="button" id="copyResBodyBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
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
          setActiveTab('routes');
          selectedId = newRoute.id;
          render();
        });
      } else {
        let route = selectedId === 'NEW_ROUTE'
          ? { id: 'route_' + Date.now(), method: 'GET', urlPattern: '/api/v1/resource', statusCode: 200, delayMs: 0, body: { message: 'Sample mock response' }, enabled: true, source: 'manual' }
          : state.routes.find(r => r.id === selectedId);

        if (!route) return;

        const isEnabled = route.enabled !== false;
        const bodyStr = typeof route.body === 'string' ? route.body : JSON.stringify(route.body, null, 2);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(route.method)}">\${escapeHtml(route.method)}</span>
              <span class="path-display" title="\${escapeHtml(route.urlPattern)}">\${selectedId === 'NEW_ROUTE' ? 'Create New Mock Route' : escapeHtml(route.urlPattern)}</span>
            </div>
            <div class="inspector-actions">
              \${selectedId !== 'NEW_ROUTE' ? \`
                <button type="button" id="openInBrowserBtn" nonce="${nonce}" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open in Browser</span>
                </button>
                <button type="button" id="copyPlaywrightBtn" nonce="${nonce}" title="Copy Playwright page.route() test spec">
                  \${ICONS.copy}
                  <span>Playwright</span>
                </button>
                <button type="button" id="copyMswBtn" nonce="${nonce}" title="Copy MSW v2 http handler">
                  \${ICONS.copy}
                  <span>MSW v2</span>
                </button>
                <button type="button" id="deleteRouteBtn" class="danger" nonce="${nonce}" title="Delete this mock route">
                  \${ICONS.trash}
                  <span>Delete</span>
                </button>
              \` : ''}
              <button type="button" id="saveRouteBtn" class="primary" nonce="${nonce}" title="Save route changes (Ctrl+S)">
                \${ICONS.save}
                <span>Save Route</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div class="form-row">
              <div class="form-group" style="width: 140px;">
                <label for="editMethod">HTTP Method</label>
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
                <label for="editUrlPattern">URL Pattern (supports wildcards * and :param)</label>
                <input type="text" id="editUrlPattern" value="\${escapeHtml(route.urlPattern)}" nonce="${nonce}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label for="editStatusCode">HTTP Status Code</label>
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
              <div class="form-group" style="width: 150px;">
                <label for="toggleRouteStatusBtn">Route Status</label>
                <button type="button" id="toggleRouteStatusBtn" class="status-toggle-btn" aria-pressed="\${isEnabled ? 'true' : 'false'}" nonce="${nonce}" title="Click to toggle between Active and Disabled">
                  <span id="routeStateDot" class="status-dot \${isEnabled ? 'online' : 'offline'}"></span>
                  <span id="routeStateText">\${isEnabled ? 'Active Mock' : 'Disabled'}</span>
                </button>
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
                    <label for="editDelayMs">Simulated Latency (ms)</label>
                    <input type="number" id="editDelayMs" min="0" step="50" value="\${route.delayMs || 0}" nonce="${nonce}">
                  </div>
                  <div class="form-group" style="flex: 1;">
                    <label for="routeSourceInput">Route Source</label>
                    <input type="text" id="routeSourceInput" readonly value="\${escapeHtml(route.source || 'manual')}" nonce="${nonce}">
                  </div>
                </div>
              </div>
            </details>

            \${route.variants ? \`
              <div class="form-group">
                <label>Frontend UI Test States & Scenarios</label>
                <div role="group" aria-label="Test Scenarios" style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button type="button" class="btn-compact scenario-btn \${(!route.scenario || route.scenario === 'ok200') ? 'btn-success' : ''}" aria-pressed="\${(!route.scenario || route.scenario === 'ok200') ? 'true' : 'false'}" data-scenario="ok200" nonce="${nonce}" title="Populated Success State">200 Populated</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'loading200' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'loading200' ? 'true' : 'false'}" data-scenario="loading200" nonce="${nonce}" title="Simulated 2000ms Latency for Testing Loaders">Loading (2s Delay)</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'empty200' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'empty200' ? 'true' : 'false'}" data-scenario="empty200" nonce="${nonce}" title="Empty Collection Zero-State">Empty State (0 items)</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'bad400' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'bad400' ? 'true' : 'false'}" data-scenario="bad400" nonce="${nonce}">400 Bad Request</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'unauth401' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'unauth401' ? 'true' : 'false'}" data-scenario="unauth401" nonce="${nonce}">401 Unauthorized</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'forbidden403' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'forbidden403' ? 'true' : 'false'}" data-scenario="forbidden403" nonce="${nonce}">403 Forbidden</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'notFound404' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'notFound404' ? 'true' : 'false'}" data-scenario="notFound404" nonce="${nonce}">404 Not Found</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'rateLimit429' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'rateLimit429' ? 'true' : 'false'}" data-scenario="rateLimit429" nonce="${nonce}">429 Rate Limit</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'server500' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'server500' ? 'true' : 'false'}" data-scenario="server500" nonce="${nonce}">500 Error</button>
                  <button type="button" class="btn-compact scenario-btn \${route.scenario === 'empty204' ? 'btn-success' : ''}" aria-pressed="\${route.scenario === 'empty204' ? 'true' : 'false'}" data-scenario="empty204" nonce="${nonce}">204 No Content</button>
                </div>
                <div id="scenarioHelpNote" class="scenario-help-note">\${getScenarioDescription(route.scenario || 'ok200')}</div>
              </div>
            \` : ''}

            \${(route.urlPattern.includes('auth') || route.urlPattern.includes('2fa') || route.urlPattern.includes('login') || bodyStr.includes('mfaRequired') || bodyStr.includes('twoFactor')) ? \`
              <div class="info-callout" style="border-left-color: var(--success);">
                <strong>Interactive 2FA / Authentication Sandbox:</strong> This endpoint supports stateful two-factor verification. Send a POST with <code>{ "code": "123456" }</code> to verify, or <code>{ "code": "000000" }</code> to test authentication rejection.
              </div>
            \` : ''}

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; font-weight: 600; color: var(--muted);">Response Body</span>
                  <span id="payloadMetrics" class="metric-pill">0.0 KB • 0 lines</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <div class="editor-mode-toggle" role="group" aria-label="Editor View Mode">
                    <button type="button" id="viewFormattedBtn" class="active" nonce="${nonce}">Visual</button>
                    <button type="button" id="viewRawBtn" nonce="${nonce}">Raw</button>
                  </div>
                  <button type="button" id="formatJsonBtn" class="btn-compact" nonce="${nonce}">Format</button>
                  <button type="button" id="copyInspectorBodyBtn" class="btn-compact" nonce="${nonce}">\${ICONS.copy} Copy</button>
                </div>
              </div>
              <div id="formattedBodyContainer" class="json-formatted-view" title="Click to edit raw JSON">\${syntaxHighlightJson(bodyStr)}</div>
              <textarea id="editBody" class="json-editor" style="display: none;" aria-label="Response Body JSON Editor" nonce="${nonce}">\${escapeHtml(bodyStr)}</textarea>
              <div id="jsonErrorBanner" class="error-banner" style="display: none; margin-top: 6px;"></div>
            </div>
          </div>
        \`;

        updatePayloadMetrics(bodyStr);

        const toggleRouteStatusBtn = document.getElementById('toggleRouteStatusBtn');
        if (toggleRouteStatusBtn) {
          toggleRouteStatusBtn.addEventListener('click', () => {
            if (selectedId === 'NEW_ROUTE') {
              route.enabled = !(route.enabled !== false);
              const nextEnabled = route.enabled !== false;
              toggleRouteStatusBtn.setAttribute('aria-pressed', nextEnabled ? 'true' : 'false');
              const dot = document.getElementById('routeStateDot');
              const txt = document.getElementById('routeStateText');
              if (dot) dot.className = 'status-dot ' + (nextEnabled ? 'online' : 'offline');
              if (txt) txt.textContent = nextEnabled ? 'Active Mock' : 'Disabled';
            } else {
              vscode.postMessage({ type: 'toggleRoute', routeId: route.id });
            }
          });
        }

        const viewFormattedBtn = document.getElementById('viewFormattedBtn');
        const viewRawBtn = document.getElementById('viewRawBtn');
        const formattedContainer = document.getElementById('formattedBodyContainer');
        const editBody = document.getElementById('editBody');

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
              document.querySelectorAll('.scenario-btn').forEach(b => {
                b.classList.remove('btn-success');
                b.setAttribute('aria-pressed', 'false');
              });
              btn.classList.add('btn-success');
              btn.setAttribute('aria-pressed', 'true');
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

        const saveBtnEl = document.getElementById('saveRouteBtn');
        saveBtnEl.addEventListener('click', () => {
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

          let updatedVariants = route.variants;
          const activeScenario = route.scenario || 'ok200';
          if (updatedVariants && updatedVariants[activeScenario]) {
            updatedVariants = {
              ...updatedVariants,
              [activeScenario]: {
                ...updatedVariants[activeScenario],
                statusCode,
                body: parsedBody,
                rawBody: JSON.stringify(parsedBody, null, 2),
              },
            };
          }

          const savedRoute = {
            id: route.id,
            method,
            urlPattern,
            statusCode,
            delayMs,
            body: parsedBody,
            headers: route.headers || { 'Content-Type': 'application/json' },
            enabled: route.enabled !== false,
            createdAt: route.createdAt || Date.now(),
            source: route.source || 'manual',
            scenario: route.scenario,
            variants: updatedVariants,
          };

          vscode.postMessage({ type: 'saveRoute', route: savedRoute });
          selectedId = savedRoute.id;

          saveBtnEl.innerHTML = ICONS.check + ' <span>Saved</span>';
          saveBtnEl.classList.add('btn-success');
          setTimeout(() => {
            const currentSaveBtn = document.getElementById('saveRouteBtn');
            if (currentSaveBtn) {
              currentSaveBtn.innerHTML = ICONS.save + ' <span>Save Route</span>';
              currentSaveBtn.classList.remove('btn-success');
            }
          }, 1500);
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
