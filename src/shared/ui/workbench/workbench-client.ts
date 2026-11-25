import { ICONS } from './workbench-templates';

export function getWorkbenchClientScript(_nonce: string): string {
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

    let activeTab = 'discovered';
    let selectedId = null;
    let pendingRouteTarget = null;
    let filterText = '';
    let filterMethod = 'ALL';
    let filterStatusClass = 'ALL';
    let isTrafficPaused = false;
    let isInspectorDirty = false;
    let hasExternalUpdatePending = false;
    let deleteConfirmTimer = null;
    let expandedModelCallId = null;
    let loadingModelKey = null;
    const typeModelCache = new Map();

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function toPlaywrightGlob(urlPattern) {
      const normalized = String(urlPattern || '/')
        .replace(/\\{([a-zA-Z0-9_]+)\\}/g, '*')
        .replace(/:([a-zA-Z0-9_]+)/g, '*');
      return '**' + (normalized.startsWith('/') ? normalized : '/' + normalized);
    }

    function toTitleCase(val) {
      const s = String(val || '');
      if (!s) return '';
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }

    function getModelCacheKey(call) {
      const typeName = (call && (call.typeArgument || call.inferredShape)) || '';
      return (call && call.fileName ? call.fileName : '') + '::' + typeName;
    }

    function requestTypeModel(call) {
      const typeName = call && (call.typeArgument || call.inferredShape);
      if (!typeName) return;
      const key = getModelCacheKey(call);
      if (typeModelCache.has(key)) return;
      loadingModelKey = key;
      vscode.postMessage({
        type: 'inspectTypeModel',
        requestKey: key,
        typeName,
        fileName: call.fileName,
      });
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
    const trafficToolbarExtra = document.getElementById('trafficToolbarExtra');
    const pauseTrafficBtn = document.getElementById('pauseTrafficBtn');
    const itemList = document.getElementById('itemList');
    const rightPane = document.getElementById('rightPane');

    function setActiveTab(tab) {
      activeTab = tab;
      isInspectorDirty = false;
      hasExternalUpdatePending = false;
      const tabs = [
        { el: tabDiscovered, id: 'discovered' },
        { el: tabRoutes, id: 'routes' },
        { el: tabTraffic, id: 'traffic' }
      ];
      tabs.forEach(t => {
        const active = t.id === tab;
        t.el.classList.toggle('active', active);
        t.el.setAttribute('aria-selected', active ? 'true' : 'false');
        t.el.setAttribute('tabindex', active ? '0' : '-1');
      });
      if (trafficToolbarExtra) {
        trafficToolbarExtra.classList.toggle('is-hidden', tab !== 'traffic');
      }
      if (clearBtn) {
        clearBtn.title = tab === 'traffic' ? 'Clear recorded traffic ledger' : 'Clear search filter (Esc)';
      }
    }

    [tabDiscovered, tabRoutes, tabTraffic].forEach((tabEl, idx, list) => {
      tabEl.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const nextIdx = e.key === 'ArrowRight'
            ? (idx + 1) % list.length
            : (idx - 1 + list.length) % list.length;
          list[nextIdx].focus();
          list[nextIdx].click();
        }
      });
    });

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

    if (pauseTrafficBtn) {
      pauseTrafficBtn.addEventListener('click', () => {
        isTrafficPaused = !isTrafficPaused;
        pauseTrafficBtn.classList.toggle('active', isTrafficPaused);
        pauseTrafficBtn.setAttribute('aria-pressed', isTrafficPaused ? 'true' : 'false');
        pauseTrafficBtn.textContent = isTrafficPaused ? 'Resume Stream' : 'Pause Stream';
        if (!isTrafficPaused) {
          renderList();
        }
      });
    }

    document.querySelectorAll('.status-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        filterStatusClass = chip.getAttribute('data-status-filter') || 'ALL';
        document.querySelectorAll('.status-chip').forEach(c => {
          c.classList.toggle('active', c === chip);
        });
        renderList();
      });
    });

    if (toggleHybridSeederBtn) {
      toggleHybridSeederBtn.addEventListener('click', () => {
        toggleHybridSeederBtn.disabled = true;
        const seederText = document.getElementById('seederText');
        if (seederText) seederText.textContent = 'Seeder: Syncing';
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
      if (activeTab === 'traffic' && !filterText && filterMethod === 'ALL' && filterStatusClass === 'ALL') {
        vscode.postMessage({ type: 'clearTraffic' });
      } else {
        filterInput.value = '';
        filterText = '';
        methodFilter.value = 'ALL';
        filterMethod = 'ALL';
        filterStatusClass = 'ALL';
        document.querySelectorAll('.status-chip').forEach(c => {
          c.classList.toggle('active', c.getAttribute('data-status-filter') === 'ALL');
        });
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
      isInspectorDirty = false;
      render();
    });

    function isEditingInspector() {
      const activeEl = document.activeElement;
      return Boolean(activeEl && rightPane && rightPane.contains(activeEl) && (
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'SELECT'
      ));
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'stateUpdate') {
        const prevTraffic = state.traffic;
        state = { ...state, ...event.data };
        if (isTrafficPaused && activeTab === 'traffic') {
          state.traffic = prevTraffic;
        }
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
        renderHeaderAndCounts();
        if (!(isTrafficPaused && activeTab === 'traffic')) {
          renderList();
        }
        if (isInspectorDirty || isEditingInspector()) {
          hasExternalUpdatePending = true;
          const dirtyBanner = document.getElementById('dirtySyncBanner');
          if (dirtyBanner) {
            dirtyBanner.classList.remove('is-hidden');
          }
        } else {
          renderInspector();
        }
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
      } else if (event.data.type === 'typeModelDetails') {
        if (event.data.requestKey && event.data.model) {
          typeModelCache.set(event.data.requestKey, event.data.model);
          if (loadingModelKey === event.data.requestKey) {
            loadingModelKey = null;
          }
          if (activeTab === 'discovered') {
            renderInspector();
          }
        }
      }
    });

    render();
    vscode.postMessage({ type: 'ready' });

    function copyWithFeedback(buttonElement, textToCopy, label) {
      if (!buttonElement) return;
      vscode.postMessage({ type: 'copyText', text: textToCopy, label });
      const originalHtml = buttonElement.innerHTML;
      buttonElement.innerHTML = ICONS.check + ' <span>Copied</span>';
      buttonElement.classList.add('is-copied');
      setTimeout(() => {
        buttonElement.innerHTML = originalHtml;
        buttonElement.classList.remove('is-copied');
      }, 1600);
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
      metricsEl.textContent = kb + ' KB · ' + lines + ' lines';
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
        } else if (filterText || filterMethod !== 'ALL' || filterStatusClass !== 'ALL') {
          filterInput.value = '';
          filterText = '';
          methodFilter.value = 'ALL';
          filterMethod = 'ALL';
          filterStatusClass = 'ALL';
          renderList();
        }
        return;
      }

      if (!isInputFocused) {
        const currentItems = getFilteredItemsForActiveTab();
        if (currentItems.length > 0) {
          const currentIdx = currentItems.findIndex(item => item.id === selectedId);
          if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault();
            const nextIdx = currentIdx < currentItems.length - 1 ? currentIdx + 1 : 0;
            selectedId = currentItems[nextIdx].id;
            isInspectorDirty = false;
            render();
            const selectedRow = itemList.querySelector('.list-row.selected');
            if (selectedRow && selectedRow.scrollIntoView) {
              selectedRow.scrollIntoView({ block: 'nearest' });
            }
          } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            const prevIdx = currentIdx > 0 ? currentIdx - 1 : currentItems.length - 1;
            selectedId = currentItems[prevIdx].id;
            isInspectorDirty = false;
            render();
            const selectedRow = itemList.querySelector('.list-row.selected');
            if (selectedRow && selectedRow.scrollIntoView) {
              selectedRow.scrollIntoView({ block: 'nearest' });
            }
          }
        }
      }
    });

    function matchesTrafficStatusFilter(statusCode) {
      if (filterStatusClass === 'ALL') return true;
      if (filterStatusClass === '2XX') return statusCode >= 200 && statusCode < 300;
      if (filterStatusClass === '4XX') return statusCode >= 400 && statusCode < 500;
      if (filterStatusClass === '5XX') return statusCode >= 500;
      return true;
    }

    function getFilteredItemsForActiveTab() {
      if (activeTab === 'discovered') {
        return (state.discoveredCalls || []).filter(c => {
          const matchUrl = c.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || c.method.toUpperCase() === filterMethod;
          return matchUrl && matchMethod;
        });
      }
      if (activeTab === 'traffic') {
        return [...(state.traffic || [])].filter(t => {
          const matchUrl = t.url.toLowerCase().includes(filterText);
          const matchMethod = filterMethod === 'ALL' || t.method.toUpperCase() === filterMethod;
          const matchStatus = matchesTrafficStatusFilter(t.statusCode);
          return matchUrl && matchMethod && matchStatus;
        }).reverse();
      }
      return (state.routes || []).filter(r => {
        const matchUrl = r.urlPattern.toLowerCase().includes(filterText);
        const matchMethod = filterMethod === 'ALL' || r.method.toUpperCase() === filterMethod || r.method === '*';
        return matchUrl && matchMethod;
      });
    }

    function renderHeaderAndCounts() {
      const seederDot = document.getElementById('seederDot');
      const seederText = document.getElementById('seederText');
      const hs = state.hybridSeeder || { enabled: false, status: 'offline' };
      if (toggleHybridSeederBtn) {
        toggleHybridSeederBtn.disabled = false;
        toggleHybridSeederBtn.setAttribute('aria-pressed', hs.enabled ? 'true' : 'false');
      }
      if (hs.enabled) {
        if (seederText) seederText.textContent = hs.status === 'synced' ? 'Seeder: Hybrid (' + (hs.recordCount || 48) + ')' : 'Seeder: Fallback';
        if (seederDot) seederDot.className = hs.status === 'synced' ? 'status-dot online' : 'status-dot warning';
      } else {
        if (seederText) seederText.textContent = 'Seeder: Local';
        if (seederDot) seederDot.className = 'status-dot is-hidden';
      }

      const connectDot = document.getElementById('connectDot');
      const connectText = document.getElementById('connectText');
      const conn = state.projectConnection;
      const isAppConnected = Boolean(conn && conn.isConnected);
      if (toggleConnectBtn) {
        toggleConnectBtn.setAttribute('aria-pressed', isAppConnected ? 'true' : 'false');
      }
      if (isAppConnected) {
        const label = conn.strategy ? toTitleCase(conn.strategy) : 'Connected';
        if (connectText) connectText.textContent = 'App: ' + label;
        if (connectDot) connectDot.className = 'status-dot online';
        if (toggleConnectBtn) toggleConnectBtn.title = 'Click to disconnect dev server and restore config';
      } else {
        if (connectText) connectText.textContent = 'App: Off';
        if (connectDot) connectDot.className = 'status-dot is-hidden';
        if (toggleConnectBtn) toggleConnectBtn.title = 'Click to connect dev server proxy (Vite, Next, Angular, Nuxt)';
      }

      const proxyDot = document.getElementById('proxyDot');
      const proxyText = document.getElementById('proxyText');
      if (toggleProxyBtn) {
        toggleProxyBtn.setAttribute('aria-pressed', state.proxy.running ? 'true' : 'false');
      }
      if (state.proxy.running) {
        if (proxyText) proxyText.textContent = 'Proxy :' + state.proxy.port;
        if (proxyDot) proxyDot.className = 'status-dot online';
        if (toggleProxyBtn) toggleProxyBtn.title = 'Click to stop local loopback proxy (127.0.0.1:' + state.proxy.port + ')';
      } else {
        if (proxyText) proxyText.textContent = 'Proxy Off';
        if (proxyDot) proxyDot.className = 'status-dot is-hidden';
        if (toggleProxyBtn) toggleProxyBtn.title = 'Click to start local loopback proxy (127.0.0.1:' + state.proxy.port + ')';
      }

      const cdpDot = document.getElementById('cdpDot');
      const cdpText = document.getElementById('cdpText');
      if (toggleCdpBtn) {
        toggleCdpBtn.setAttribute('aria-pressed', state.cdp.attached ? 'true' : 'false');
      }
      if (state.cdp.attached) {
        if (cdpText) cdpText.textContent = 'CDP :' + state.cdp.port;
        if (cdpDot) cdpDot.className = 'status-dot online';
        if (toggleCdpBtn) toggleCdpBtn.title = 'Click to detach browser CDP bridge';
      } else {
        if (cdpText) cdpText.textContent = 'CDP: Off';
        if (cdpDot) cdpDot.className = 'status-dot is-hidden';
        if (toggleCdpBtn) toggleCdpBtn.title = 'Click to attach browser CDP bridge';
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
      const stackMeta = document.getElementById('stackMeta');
      if (stackMeta) {
        if (stack && stack.frameworkDisplayName) {
          const majorVer = stack.frameworkVersion ? ' ' + String(stack.frameworkVersion).split('.')[0] : '';
          const clientLabel = stack.primaryClient === 'angular-http' ? 'HttpClient' : stack.primaryClient;
          const lang = stack.hasTypeScript ? 'TS' : 'JS';
          stackMeta.textContent = stack.frameworkDisplayName + majorVer + ' · ' + clientLabel + ' · ' + lang;
          stackMeta.title = stack.conventions ? stack.conventions.description : '';
        } else {
          stackMeta.textContent = 'TS / JS';
        }
      }
    }

    function render() {
      renderHeaderAndCounts();
      renderList();
      renderInspector();
    }

    function getMethodTagClass(method) {
      const m = (method || '').toUpperCase();
      return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE' ? 'is-mutating' : '';
    }

    function getStatusClass(code) {
      if (code >= 400 && code < 500) return 'status-4xx';
      if (code >= 500) return 'status-5xx';
      return '';
    }

    function renderList() {
      itemList.innerHTML = '';
      itemList.removeAttribute('aria-activedescendant');

      if (activeTab === 'discovered') {
        if (state.isScanning) {
          const loadingBanner = document.createElement('div');
          loadingBanner.className = 'banner-bar';
          loadingBanner.innerHTML = \`
            <span class="inspector-row-group">
              <span class="status-dot online"></span>
              <span>Scanning workspace AST...</span>
            </span>
          \`;
          itemList.appendChild(loadingBanner);
          return;
        }

        if (state.scanError) {
          const errorPrompt = document.createElement('div');
          errorPrompt.className = 'empty-prompt py-30';
          errorPrompt.innerHTML = \`
            <strong>AST Workspace Scan Failed</strong>
            <span class="empty-sub">\${escapeHtml(state.scanError)}</span>
            <button id="retryScanBtn" class="primary btn-compact mt-6">
              \${ICONS.search}
              <span>Retry Scan</span>
            </button>
          \`;
          errorPrompt.querySelector('#retryScanBtn').addEventListener('click', () => scanBtn.click());
          itemList.appendChild(errorPrompt);
          return;
        }

        const calls = state.discoveredCalls || [];
        const filtered = getFilteredItemsForActiveTab();

        if (calls.length > 0) {
          const banner = document.createElement('div');
          banner.className = 'banner-bar';
          const unmockedCalls = calls.filter(call =>
            !state.routes.some(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'))
          );
          const allMocked = calls.length > 0 && unmockedCalls.length === 0;
          const someMocked = unmockedCalls.length > 0 && unmockedCalls.length < calls.length;

          let mockBtnText = 'Mock All (' + calls.length + ')';
          let mockBtnIcon = ICONS.wand;
          let mockBtnClass = 'accent btn-compact';
          let mockBtnTitle = 'Synthesize mocks for all discovered endpoints';

          if (allMocked) {
            mockBtnText = 'Regenerate All';
            mockBtnIcon = ICONS.refresh;
            mockBtnClass = 'btn-compact';
            mockBtnTitle = 'All endpoints have routes. Regenerate with fresh synthetic payloads.';
          } else if (someMocked) {
            mockBtnText = 'Mock Remaining (' + unmockedCalls.length + ')';
            mockBtnIcon = ICONS.wand;
            mockBtnClass = 'accent btn-compact';
            mockBtnTitle = 'Generate mocks for ' + unmockedCalls.length + ' unmocked endpoints';
          }

          banner.innerHTML = \`
            <span><strong>\${calls.length}</strong> endpoints</span>
            <button id="mockAllBtn" class="\${mockBtnClass}" title="\${mockBtnTitle}">
              \${mockBtnIcon}
              <span>\${mockBtnText}</span>
            </button>
          \`;
          itemList.appendChild(banner);

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
          emptyFilter.className = 'empty-prompt py-30';
          emptyFilter.innerHTML = \`
            <strong>No matching endpoints</strong>
            <span class="empty-sub">No detected endpoints match "<strong>\${escapeHtml(filterText)}</strong>".</span>
            <button id="clearSearchBtn" class="btn-compact mt-6">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearSearchBtn').addEventListener('click', () => clearBtn.click());
          itemList.appendChild(emptyFilter);
          return;
        }

        if (calls.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt py-30';
          empty.innerHTML = \`
            <strong>No API calls detected yet</strong>
            <span class="empty-sub">Scans fetch, axios, useQuery, RTK Query, and HttpClient calls in workspace TypeScript/JS files.</span>
            <button id="emptyScanBtn" class="primary btn-compact mt-6">
              \${ICONS.search}
              <span>Scan Workspace</span>
            </button>
          \`;
          empty.querySelector('#emptyScanBtn').addEventListener('click', () => vscode.postMessage({ type: 'scanWorkspace' }));
          itemList.appendChild(empty);
          return;
        }

        filtered.forEach(call => {
          const matchedRoute = state.routes.find(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));
          const isAlreadyMocked = Boolean(matchedRoute);
          const isRouteEnabled = Boolean(matchedRoute && matchedRoute.enabled !== false);
          const isSelected = selectedId === call.id;
          const row = document.createElement('div');
          row.id = 'opt_' + call.id;
          row.className = 'list-row' + (isSelected ? ' selected' : '');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          if (isSelected) itemList.setAttribute('aria-activedescendant', row.id);
          const filename = (call.fileName || '').split(/[\\\\/]/).pop() || '';
          const locLabel = filename ? filename + ':' + (call.range.start.line + 1) : call.clientType;

          row.innerHTML = \`
            <div class="row-primary">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${escapeHtml(call.method)}</span>
              <span class="path-text" title="\${escapeHtml(call.url)}">\${escapeHtml(call.url)}</span>
            </div>
            <div class="row-meta">
              <div class="row-meta-left">
                <span class="row-source-text">\${escapeHtml(locLabel)}</span>
                \${call.typeArgument ? \`<span aria-hidden="true">·</span><button type="button" class="inline-link-btn type-tag-btn" title="Inspect model definition for \${escapeHtml(call.typeArgument)}">&lt;\${escapeHtml(call.typeArgument)}&gt;</button>\` : ''}
              </div>
              \${isAlreadyMocked
                ? \`<button type="button" class="inline-link-btn goto-route-btn" title="Open active route in Routes tab">\${isRouteEnabled ? 'Mocked' : 'Mocked (Off)'}</button>\`
                : \`<button type="button" class="inline-link-btn mini-mock-btn">+ Mock</button>\`
              }
            </div>
          \`;

          const typeBtn = row.querySelector('.type-tag-btn');
          if (typeBtn) {
            typeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              selectedId = call.id;
              expandedModelCallId = call.id;
              isInspectorDirty = false;
              requestTypeModel(call);
              render();
              const modelSec = document.getElementById('modelDefinitionSection');
              if (modelSec && modelSec.scrollIntoView) {
                modelSec.scrollIntoView({ block: 'nearest' });
              }
            });
          }

          const gotoRouteBtn = row.querySelector('.goto-route-btn');
          if (gotoRouteBtn && matchedRoute) {
            gotoRouteBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              setActiveTab('routes');
              selectedId = matchedRoute.id;
              render();
            });
          }

          const mockBtn = row.querySelector('.mini-mock-btn');
          if (mockBtn) {
            mockBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'mockDetectedCall', call });
            });
          }

          row.addEventListener('click', () => {
            selectedId = call.id;
            isInspectorDirty = false;
            render();
          });
          itemList.appendChild(row);
        });
      } else if (activeTab === 'traffic') {
        const filtered = getFilteredItemsForActiveTab();

        if (state.traffic.length > 0 && filtered.length === 0) {
          const emptyFilter = document.createElement('div');
          emptyFilter.className = 'empty-prompt py-30';
          emptyFilter.innerHTML = \`
            <strong>No matching traffic</strong>
            <span class="empty-sub">No recorded requests match current filters.</span>
            <button id="clearTrafficFilterBtn" class="btn-compact mt-6">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearTrafficFilterBtn').addEventListener('click', () => clearBtn.click());
          itemList.appendChild(emptyFilter);
          return;
        }

        if (filtered.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt py-30';
          empty.innerHTML = \`
            <strong>No traffic recorded yet</strong>
            <span class="empty-sub">Send a request via 127.0.0.1:\${state.proxy.port} or attach CDP to capture traffic.</span>
          \`;
          itemList.appendChild(empty);
          return;
        }

        filtered.forEach(t => {
          const isSelected = selectedId === t.id;
          const row = document.createElement('div');
          row.id = 'opt_' + t.id;
          row.className = 'list-row' + (isSelected ? ' selected' : '');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          if (isSelected) itemList.setAttribute('aria-activedescendant', row.id);
          const slowClass = (t.durationMs || 0) >= 1000 ? ' is-slow' : '';

          row.innerHTML = \`
            <div class="row-primary">
              <span class="method-tag \${getMethodTagClass(t.method)}">\${escapeHtml(t.method)}</span>
              <span class="path-text" title="\${escapeHtml(t.url)}">\${escapeHtml(t.url)}</span>
              <span class="status-code-tag \${getStatusClass(t.statusCode)}">\${t.statusCode}</span>
            </div>
            <div class="row-meta">
              <span>\${t.isMocked ? 'Mocked' : 'Passthrough'}</span>
              <span class="traffic-duration\${slowClass}">\${t.durationMs}ms</span>
            </div>
          \`;
          row.addEventListener('click', () => {
            selectedId = t.id;
            isInspectorDirty = false;
            render();
          });
          itemList.appendChild(row);
        });
      } else {
        const filtered = getFilteredItemsForActiveTab();

        if (state.routes.length > 0 && filtered.length === 0 && selectedId !== 'NEW_ROUTE') {
          const emptyFilter = document.createElement('div');
          emptyFilter.className = 'empty-prompt py-30';
          emptyFilter.innerHTML = \`
            <strong>No matching mock routes</strong>
            <span class="empty-sub">No active routes match "<strong>\${escapeHtml(filterText)}</strong>".</span>
            <button id="clearRoutesFilterBtn" class="btn-compact mt-6">Clear Filter</button>
          \`;
          emptyFilter.querySelector('#clearRoutesFilterBtn').addEventListener('click', () => clearBtn.click());
          itemList.appendChild(emptyFilter);
          return;
        }

        if (filtered.length === 0 && selectedId !== 'NEW_ROUTE') {
          const empty = document.createElement('div');
          empty.className = 'empty-prompt py-30';
          empty.innerHTML = \`
            <strong>No mock routes active</strong>
            <span class="empty-sub">Create a route or synthesize mocks from the Discovered tab.</span>
            <button id="emptyCreateBtn" class="primary btn-compact mt-6">
              \${ICONS.plus}
              <span>New Mock Route</span>
            </button>
          \`;
          empty.querySelector('#emptyCreateBtn').addEventListener('click', () => {
            selectedId = 'NEW_ROUTE';
            isInspectorDirty = false;
            render();
          });
          itemList.appendChild(empty);
          return;
        }

        filtered.forEach(r => {
          const isSelected = selectedId === r.id;
          const isEnabled = r.enabled !== false;
          const row = document.createElement('div');
          row.id = 'opt_' + r.id;
          row.className = 'list-row' + (isSelected ? ' selected' : '') + (!isEnabled ? ' disabled-route' : '');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          if (isSelected) itemList.setAttribute('aria-activedescendant', row.id);
          row.innerHTML = \`
            <div class="row-primary">
              <span class="method-tag \${getMethodTagClass(r.method)}">\${escapeHtml(r.method)}</span>
              <span class="path-text" title="\${escapeHtml(r.urlPattern)}">\${escapeHtml(r.urlPattern)}</span>
              <span class="status-code-tag \${getStatusClass(r.statusCode)}">\${r.statusCode}</span>
            </div>
            <div class="row-meta">
              <button type="button" class="route-toggle-pill" title="\${isEnabled ? 'Click to disable route' : 'Click to enable route'}" aria-pressed="\${isEnabled ? 'true' : 'false'}">
                \${isEnabled ? '<span class="status-dot online" aria-hidden="true"></span>' : ''}
                <span>\${isEnabled ? 'Active' : 'Disabled'}</span>
              </button>
              <span class="traffic-duration">\${r.delayMs ? r.delayMs + 'ms' : '0ms'}</span>
            </div>
          \`;
          const togglePill = row.querySelector('.route-toggle-pill');
          if (togglePill) {
            togglePill.addEventListener('click', (e) => {
              e.stopPropagation();
              vscode.postMessage({ type: 'toggleRoute', routeId: r.id });
            });
          }
          row.addEventListener('click', () => {
            selectedId = r.id;
            isInspectorDirty = false;
            render();
          });
          itemList.appendChild(row);
        });
      }
    }

    function renderEmptyInspector() {
      rightPane.innerHTML = \`
        <div class="empty-prompt">
          <span aria-hidden="true">\${ICONS.radar}</span>
          <strong class="empty-title-lg">No Endpoint Selected</strong>
          <span class="empty-desc-lg">Select an endpoint, route, or traffic entry to inspect TypeScript contracts, switch scenarios, or edit responses.</span>
          <div class="empty-kbd-inline">/ filter · j / k navigate · Ctrl+S save · Esc clear</div>
        </div>
      \`;
    }

    function renderInspector() {
      if (!selectedId) {
        renderEmptyInspector();
        return;
      }

      if (activeTab === 'discovered') {
        const call = (state.discoveredCalls || []).find(c => c.id === selectedId);
        if (!call) {
          selectedId = null;
          renderEmptyInspector();
          return;
        }
        const matchedRoute = state.routes.find(r => r.urlPattern === call.url && (r.method === call.method || r.method === '*'));
        const isAlreadyMocked = Boolean(matchedRoute);
        const typeLabel = call.typeArgument || call.inferredShape;
        const modelCacheKey = getModelCacheKey(call);
        const resolvedModel = typeLabel ? typeModelCache.get(modelCacheKey) : null;
        const isModelExpanded = Boolean(typeLabel && expandedModelCallId === call.id);
        const isModelLoading = Boolean(typeLabel && loadingModelKey === modelCacheKey);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(call.method)}">\${escapeHtml(call.method)}</span>
              <span class="path-display" title="\${escapeHtml(call.url)}">\${escapeHtml(call.url)}</span>
            </div>
            <div class="inspector-actions">
              \${isAlreadyMocked ? \`
                <button type="button" id="openDiscoveredInBrowserBtn" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open in Browser</span>
                </button>
                <button type="button" id="viewActiveRouteBtn" title="Inspect and edit the active mock route">
                  \${ICONS.layers}
                  <span>Edit Route</span>
                </button>
              \` : ''}
              <button type="button" id="inspectMockBtn" class="accent">
                \${ICONS.wand}
                <span>\${isAlreadyMocked ? 'Regenerate Mock' : 'Synthesize Mock'}</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <dl class="kv-list">
              <dt>Client</dt>
              <dd><span class="kv-value-text">\${escapeHtml(call.clientType)}</span></dd>

              <dt>Return Type</dt>
              <dd>
                <span class="kv-value-text">\${escapeHtml(typeLabel || 'Unannotated (inferred)')}</span>
                \${typeLabel ? \`
                  <button type="button" id="inspectTypeModelBtn" class="inline-link-btn" title="Toggle underlying TypeScript model definition">
                    \${isModelExpanded ? 'Hide Definition' : 'Inspect Definition'}
                  </button>
                \` : ''}
              </dd>

              <dt>Source</dt>
              <dd>
                \${call.fileName ? \`
                  <button type="button" id="openSourceBtn" class="inline-link-btn kv-value-text" title="Open \${escapeHtml(call.fileName)} in editor">
                    \${escapeHtml(call.fileName)}:\${call.range.start.line + 1}
                  </button>
                \` : '<span class="kv-value-text">OpenAPI Schema</span>'}
              </dd>
            </dl>

            \${isModelExpanded ? \`
              <section id="modelDefinitionSection" class="inspector-section" aria-label="TypeScript Model Definition">
                <div class="model-header-meta">
                  <div class="inspector-row-group">
                    <span class="inspector-sublabel">Type Definition</span>
                    <span class="model-kind-text">\${escapeHtml(resolvedModel ? (resolvedModel.kind || 'type') + ' ' + resolvedModel.baseTypeName : typeLabel)}</span>
                    \${resolvedModel && resolvedModel.filePath ? \`
                      <button type="button" id="gotoModelDefBtn" class="inline-link-btn model-file-loc" title="Open \${escapeHtml(resolvedModel.filePath)} in editor">
                        \${escapeHtml(resolvedModel.filePath.split(/[\\\\/]/).pop())}\${typeof resolvedModel.line === 'number' ? ':' + (resolvedModel.line + 1) : ''}
                      </button>
                    \` : ''}
                  </div>
                  \${resolvedModel ? \`
                    <button type="button" id="copyModelDefBtn" class="btn-compact" title="Copy TypeScript model definition">
                      \${ICONS.copy}
                      <span>Copy</span>
                    </button>
                  \` : ''}
                </div>
                \${isModelLoading && !resolvedModel
                  ? '<div class="metric-pill">Resolving TypeScript model definition...</div>'
                  : \`<pre class="code-surface">\${escapeHtml(resolvedModel ? resolvedModel.definitionText : '// Unable to resolve model.')}</pre>\`
                }
                \${resolvedModel && Array.isArray(resolvedModel.relatedModels) && resolvedModel.relatedModels.length > 0 ? \`
                  <div class="related-models-list">
                    \${resolvedModel.relatedModels.map((rel, relIdx) => \`
                      <div class="inspector-section">
                        <div class="model-header-meta">
                          <div class="inspector-row-group">
                            <span class="model-kind-text">\${escapeHtml(rel.kind)} \${escapeHtml(rel.name)}</span>
                            \${rel.filePath ? \`
                              <button type="button" class="inline-link-btn model-file-loc goto-related-model-btn" data-rel-idx="\${relIdx}" title="Open \${escapeHtml(rel.filePath)}">
                                \${escapeHtml(rel.filePath.split(/[\\\\/]/).pop())}\${typeof rel.line === 'number' ? ':' + (rel.line + 1) : ''}
                              </button>
                            \` : ''}
                          </div>
                        </div>
                        <pre class="code-surface">\${escapeHtml(rel.definitionText)}</pre>
                      </div>
                    \`).join('')}
                  </div>
                \` : ''}
              </section>
            \` : ''}

            <details open class="inspector-section">
              <summary>
                <span class="summary-title-group">
                  <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  <span>Call Expression</span>
                </span>
                <button type="button" id="copyExprBtn" class="btn-compact" title="Copy code expression">\${ICONS.copy} Copy</button>
              </summary>
              <pre class="code-surface code-surface-wrap">\${escapeHtml(call.rawExpression)}</pre>
            </details>
          </div>
        \`;

        const inspectTypeModelBtn = document.getElementById('inspectTypeModelBtn');
        if (inspectTypeModelBtn) {
          inspectTypeModelBtn.addEventListener('click', () => {
            if (expandedModelCallId === call.id) {
              expandedModelCallId = null;
              renderInspector();
            } else {
              expandedModelCallId = call.id;
              requestTypeModel(call);
              renderInspector();
            }
          });
        }

        const gotoModelDefBtn = document.getElementById('gotoModelDefBtn');
        if (gotoModelDefBtn && resolvedModel && resolvedModel.filePath) {
          gotoModelDefBtn.addEventListener('click', () => {
            vscode.postMessage({
              type: 'openSourceLocation',
              fileName: resolvedModel.filePath,
              line: resolvedModel.line || 0,
              character: 0,
            });
          });
        }

        const copyModelDefBtn = document.getElementById('copyModelDefBtn');
        if (copyModelDefBtn && resolvedModel) {
          copyModelDefBtn.addEventListener('click', () => {
            copyWithFeedback(copyModelDefBtn, resolvedModel.definitionText, 'TypeScript model');
          });
        }

        document.querySelectorAll('.goto-related-model-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-rel-idx') || '-1', 10);
            const rel = resolvedModel && resolvedModel.relatedModels && resolvedModel.relatedModels[idx];
            if (rel && rel.filePath) {
              vscode.postMessage({
                type: 'openSourceLocation',
                fileName: rel.filePath,
                line: rel.line || 0,
                character: 0,
              });
            }
          });
        });

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
          copyExprBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyWithFeedback(copyExprBtn, call.rawExpression, 'code expression');
          });
        }
      } else if (activeTab === 'traffic') {
        const item = state.traffic.find(t => t.id === selectedId);
        if (!item) {
          selectedId = null;
          renderEmptyInspector();
          return;
        }

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(item.method)}">\${escapeHtml(item.method)}</span>
              <span class="path-display" title="\${escapeHtml(item.url)}">\${escapeHtml(item.url)}</span>
              <span class="status-code-tag \${getStatusClass(item.statusCode)}">\${item.statusCode}</span>
            </div>
            <div class="inspector-actions">
              <button type="button" id="replayTrafficBtn" title="Replay this HTTP request against the local MockScope proxy">
                \${ICONS.play}
                <span>Replay</span>
              </button>
              <button type="button" id="openTrafficInBrowserBtn" title="Preview endpoint in browser">
                \${ICONS.external}
                <span>Open in Browser</span>
              </button>
              <button type="button" id="promoteMockBtn" class="primary">
                \${ICONS.plus}
                <span>Save as Route</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <dl class="kv-list">
              <dt>Status</dt>
              <dd><span class="traffic-duration \${getStatusClass(item.statusCode)}">\${item.statusCode} · \${item.durationMs}ms</span></dd>
              <dt>Interception</dt>
              <dd><span>\${item.isMocked ? 'Mocked' : 'Upstream Passthrough'}</span></dd>
            </dl>

            <details open class="inspector-section">
              <summary>
                <span class="summary-title-group">
                  <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  <span>Response Body</span>
                </span>
                <button type="button" id="copyResBodyBtn" class="btn-compact">\${ICONS.copy} Copy</button>
              </summary>
              <div class="json-formatted-view">\${syntaxHighlightJson(item.responseBody || '(empty body)')}</div>
            </details>

            <details open class="inspector-section">
              <summary>
                <span class="summary-title-group">
                  <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  <span>Request Headers (Sanitized)</span>
                </span>
                <button type="button" id="copyReqHdrBtn" class="btn-compact">\${ICONS.copy} Copy</button>
              </summary>
              <pre class="code-surface code-surface-wrap">\${escapeHtml(JSON.stringify(item.requestHeaders, null, 2))}</pre>
            </details>

            \${item.requestBody ? \`
              <details open class="inspector-section">
                <summary>
                  <span class="summary-title-group">
                    <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span>Request Body</span>
                  </span>
                </summary>
                <pre class="code-surface code-surface-wrap">\${escapeHtml(item.requestBody)}</pre>
              </details>
            \` : ''}

            <details class="inspector-section">
              <summary>
                <span class="summary-title-group">
                  <svg class="chevron-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  <span>Response Headers</span>
                </span>
              </summary>
              <pre class="code-surface code-surface-wrap">\${escapeHtml(JSON.stringify(item.responseHeaders, null, 2))}</pre>
            </details>
          </div>
        \`;

        const replayTrafficBtn = document.getElementById('replayTrafficBtn');
        if (replayTrafficBtn) {
          replayTrafficBtn.addEventListener('click', () => {
            replayTrafficBtn.disabled = true;
            replayTrafficBtn.innerHTML = ICONS.refresh + ' <span>Replaying...</span>';
            vscode.postMessage({ type: 'replayTraffic', entry: item });
            setTimeout(() => {
              replayTrafficBtn.disabled = false;
              replayTrafficBtn.innerHTML = ICONS.play + ' <span>Replay</span>';
            }, 600);
          });
        }

        const copyReqHdrBtn = document.getElementById('copyReqHdrBtn');
        if (copyReqHdrBtn) {
          copyReqHdrBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyWithFeedback(copyReqHdrBtn, JSON.stringify(item.requestHeaders, null, 2), 'Request Headers');
          });
        }

        const copyResBodyBtn = document.getElementById('copyResBodyBtn');
        if (copyResBodyBtn) {
          copyResBodyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
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
          isInspectorDirty = false;
          render();
        });
      } else {
        let route = selectedId === 'NEW_ROUTE'
          ? { id: 'route_' + Date.now(), method: 'GET', urlPattern: '/api/v1/resource', statusCode: 200, delayMs: 0, body: { message: 'Sample mock response' }, enabled: true, source: 'manual' }
          : state.routes.find(r => r.id === selectedId);

        if (!route) {
          selectedId = null;
          renderEmptyInspector();
          return;
        }

        const isEnabled = route.enabled !== false;
        const bodyStr = typeof route.body === 'string' ? route.body : JSON.stringify(route.body, null, 2);
        const primaryScenarios = new Set(['ok200', 'loading200', 'empty200', 'unauth401', 'notFound404', 'server500']);
        const activeScenario = route.scenario || 'ok200';
        const isSecondaryScenario = !primaryScenarios.has(activeScenario);

        rightPane.innerHTML = \`
          <div class="inspector-header">
            <div class="inspector-title">
              <span class="method-tag \${getMethodTagClass(route.method)}">\${escapeHtml(route.method)}</span>
              <span class="path-display" title="\${escapeHtml(route.urlPattern)}">\${selectedId === 'NEW_ROUTE' ? 'New Mock Route' : escapeHtml(route.urlPattern)}</span>
            </div>
            <div class="inspector-actions">
              \${selectedId !== 'NEW_ROUTE' ? \`
                <button type="button" id="openInBrowserBtn" title="Preview mock endpoint in browser">
                  \${ICONS.external}
                  <span>Open</span>
                </button>
                <button type="button" id="copyPlaywrightBtn" title="Copy Playwright page.route() test spec">
                  \${ICONS.copy}
                  <span>Playwright</span>
                </button>
                <button type="button" id="copyMswBtn" title="Copy MSW v2 http handler">
                  \${ICONS.copy}
                  <span>MSW</span>
                </button>
                <button type="button" id="deleteRouteBtn" class="danger" title="Delete this mock route">
                  \${ICONS.trash}
                  <span>Delete</span>
                </button>
              \` : ''}
              <button type="button" id="saveRouteBtn" class="primary" title="Save route changes (Ctrl+S)">
                \${ICONS.save}
                <span>Save</span>
              </button>
            </div>
          </div>
          <div class="inspector-body">
            <div id="dirtySyncBanner" class="dirty-banner \${hasExternalUpdatePending ? '' : 'is-hidden'}" role="status">
              <span>Route state updated externally while editing.</span>
              <button type="button" id="reloadDirtyRouteBtn" class="btn-compact">Reload</button>
            </div>

            <div class="form-row">
              <div class="form-group w-140">
                <label for="editMethod">Method</label>
                <select id="editMethod">
                  <option value="GET" \${route.method === 'GET' ? 'selected' : ''}>GET</option>
                  <option value="POST" \${route.method === 'POST' ? 'selected' : ''}>POST</option>
                  <option value="PUT" \${route.method === 'PUT' ? 'selected' : ''}>PUT</option>
                  <option value="PATCH" \${route.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                  <option value="DELETE" \${route.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                  <option value="*" \${route.method === '*' ? 'selected' : ''}>* (ANY)</option>
                </select>
              </div>
              <div class="form-group flex-1">
                <label for="editUrlPattern">URL Pattern (*, :param, ?query)</label>
                <input type="text" id="editUrlPattern" value="\${escapeHtml(route.urlPattern)}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label for="editStatusCode">Status</label>
                <select id="editStatusCode">
                  <option value="200" \${route.statusCode === 200 ? 'selected' : ''}>200 OK</option>
                  <option value="201" \${route.statusCode === 201 ? 'selected' : ''}>201 Created</option>
                  <option value="204" \${route.statusCode === 204 ? 'selected' : ''}>204 No Content</option>
                  <option value="400" \${route.statusCode === 400 ? 'selected' : ''}>400 Bad Request</option>
                  <option value="401" \${route.statusCode === 401 ? 'selected' : ''}>401 Unauthorized</option>
                  <option value="403" \${route.statusCode === 403 ? 'selected' : ''}>403 Forbidden</option>
                  <option value="404" \${route.statusCode === 404 ? 'selected' : ''}>404 Not Found</option>
                  <option value="422" \${route.statusCode === 422 ? 'selected' : ''}>422 Unprocessable</option>
                  <option value="429" \${route.statusCode === 429 ? 'selected' : ''}>429 Rate Limit</option>
                  <option value="500" \${route.statusCode === 500 ? 'selected' : ''}>500 Server Error</option>
                  <option value="503" \${route.statusCode === 503 ? 'selected' : ''}>503 Service Unavailable</option>
                </select>
              </div>
              <div class="form-group w-150">
                <label for="editDelayMs">
                  <span>Delay (ms)</span>
                  <span class="latency-links">
                    <button type="button" class="inline-link-btn delay-preset-btn" data-delay="0">0</button>
                    <button type="button" class="inline-link-btn delay-preset-btn" data-delay="250">250</button>
                    <button type="button" class="inline-link-btn delay-preset-btn" data-delay="1000">1s</button>
                    <button type="button" class="inline-link-btn delay-preset-btn" data-delay="2000">2s</button>
                  </span>
                </label>
                <input type="number" id="editDelayMs" min="0" step="50" value="\${route.delayMs || 0}">
              </div>
              <div class="form-group w-140">
                <label for="toggleRouteStatusBtn">State</label>
                <button type="button" id="toggleRouteStatusBtn" class="status-toggle-btn" aria-pressed="\${isEnabled ? 'true' : 'false'}" title="Toggle route active/disabled">
                  \${isEnabled ? '<span id="routeStateDot" class="status-dot online" aria-hidden="true"></span>' : '<span id="routeStateDot" class="status-dot is-hidden" aria-hidden="true"></span>'}
                  <span id="routeStateText">\${isEnabled ? 'Active' : 'Disabled'}</span>
                </button>
              </div>
            </div>

            \${route.variants ? \`
              <div class="form-group">
                <label>Scenario</label>
                <div class="scenario-segmented" role="group" aria-label="Primary Scenarios">
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'ok200' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'ok200' ? 'true' : 'false'}" data-scenario="ok200" title="Populated 200 OK payload">200</button>
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'loading200' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'loading200' ? 'true' : 'false'}" data-scenario="loading200" title="200 OK with 2000ms simulated latency">Loading 2s</button>
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'empty200' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'empty200' ? 'true' : 'false'}" data-scenario="empty200" title="Empty collection 200 OK">Empty</button>
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'unauth401' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'unauth401' ? 'true' : 'false'}" data-scenario="unauth401" title="401 Unauthorized error">401</button>
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'notFound404' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'notFound404' ? 'true' : 'false'}" data-scenario="notFound404" title="404 Not Found error">404</button>
                  <button type="button" class="btn-compact scenario-btn \${activeScenario === 'server500' ? 'is-selected' : ''}" aria-pressed="\${activeScenario === 'server500' ? 'true' : 'false'}" data-scenario="server500" title="500 Internal Server Error">500</button>
                  <select id="moreScenarioSelect" class="scenario-more-select" aria-label="More scenarios">
                    <option value="" \${!isSecondaryScenario ? 'selected' : ''}>More...</option>
                    <option value="mfa200" \${activeScenario === 'mfa200' ? 'selected' : ''}>2FA Challenge (200)</option>
                    <option value="bad400" \${activeScenario === 'bad400' ? 'selected' : ''}>400 Bad Request</option>
                    <option value="forbidden403" \${activeScenario === 'forbidden403' ? 'selected' : ''}>403 Forbidden</option>
                    <option value="rateLimit429" \${activeScenario === 'rateLimit429' ? 'selected' : ''}>429 Rate Limit</option>
                    <option value="empty204" \${activeScenario === 'empty204' ? 'selected' : ''}>204 No Content</option>
                  </select>
                </div>
                \${activeScenario === 'mfa200' ? '<span class="mfa-inline-hint">2FA sandbox: POST {"code":"123456"} verifies; {"code":"000000"} rejects (401).</span>' : ''}
              </div>
            \` : ''}

            <div class="form-group">
              <div class="inspector-row-between">
                <div class="inspector-row-group">
                  <span class="inspector-sublabel">Response Body</span>
                  <span id="payloadMetrics" class="metric-pill">0.0 KB · 0 lines</span>
                </div>
                <div class="inspector-row-group">
                  <div class="editor-mode-toggle" role="group" aria-label="Editor View Mode">
                    <button type="button" id="viewFormattedBtn" class="active">Visual</button>
                    <button type="button" id="viewRawBtn">Raw</button>
                  </div>
                  <button type="button" id="formatJsonBtn" class="btn-compact">Format</button>
                  <button type="button" id="copyInspectorBodyBtn" class="btn-compact">\${ICONS.copy} Copy</button>
                </div>
              </div>
              <div id="formattedBodyContainer" class="json-formatted-view" title="Click to edit raw JSON">\${syntaxHighlightJson(bodyStr)}</div>
              <textarea id="editBody" class="json-editor is-hidden" aria-label="Response Body JSON Editor">\${escapeHtml(bodyStr)}</textarea>
              <div id="jsonErrorBanner" class="error-banner is-hidden" role="alert"></div>
            </div>
          </div>
        \`;

        updatePayloadMetrics(bodyStr);

        const reloadDirtyBtn = document.getElementById('reloadDirtyRouteBtn');
        if (reloadDirtyBtn) {
          reloadDirtyBtn.addEventListener('click', () => {
            isInspectorDirty = false;
            hasExternalUpdatePending = false;
            renderInspector();
          });
        }

        ['editMethod', 'editUrlPattern', 'editStatusCode', 'editDelayMs'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', () => { isInspectorDirty = true; });
            el.addEventListener('input', () => { isInspectorDirty = true; });
          }
        });

        document.querySelectorAll('.delay-preset-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const delayVal = btn.getAttribute('data-delay') || '0';
            const delayInput = document.getElementById('editDelayMs');
            if (delayInput) {
              delayInput.value = delayVal;
              isInspectorDirty = true;
            }
          });
        });

        const toggleRouteStatusBtn = document.getElementById('toggleRouteStatusBtn');
        if (toggleRouteStatusBtn) {
          toggleRouteStatusBtn.addEventListener('click', () => {
            if (selectedId === 'NEW_ROUTE') {
              route.enabled = !(route.enabled !== false);
              const nextEnabled = route.enabled !== false;
              toggleRouteStatusBtn.setAttribute('aria-pressed', nextEnabled ? 'true' : 'false');
              const dot = document.getElementById('routeStateDot');
              const txt = document.getElementById('routeStateText');
              if (dot) dot.className = nextEnabled ? 'status-dot online' : 'status-dot is-hidden';
              if (txt) txt.textContent = nextEnabled ? 'Active' : 'Disabled';
            } else {
              isInspectorDirty = false;
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
            formattedContainer.classList.remove('is-hidden');
            editBody.classList.add('is-hidden');
          });

          viewRawBtn.addEventListener('click', () => {
            viewRawBtn.classList.add('active');
            viewFormattedBtn.classList.remove('active');
            formattedContainer.classList.add('is-hidden');
            editBody.classList.remove('is-hidden');
            editBody.focus();
          });

          formattedContainer.addEventListener('click', () => {
            viewRawBtn.click();
          });

          editBody.addEventListener('input', () => {
            isInspectorDirty = true;
            updatePayloadMetrics(editBody.value);
            const errorBanner = document.getElementById('jsonErrorBanner');
            const saveBtn = document.getElementById('saveRouteBtn');
            try {
              JSON.parse(editBody.value);
              editBody.classList.remove('json-editor-invalid');
              if (errorBanner) errorBanner.classList.add('is-hidden');
              if (saveBtn) saveBtn.disabled = false;
              formattedContainer.innerHTML = syntaxHighlightJson(editBody.value);
            } catch (err) {
              editBody.classList.add('json-editor-invalid');
              if (saveBtn) saveBtn.disabled = true;
              if (errorBanner) {
                errorBanner.textContent = 'JSON Syntax Error: ' + err.message;
                errorBanner.classList.remove('is-hidden');
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

        function applyScenarioSelection(sc) {
          if (!sc || !route.variants || !route.variants[sc]) return;
          isInspectorDirty = false;
          const v = route.variants[sc];
          route.scenario = sc;
          document.querySelectorAll('.scenario-btn').forEach(b => {
            const match = b.getAttribute('data-scenario') === sc;
            b.classList.toggle('is-selected', match);
            b.setAttribute('aria-pressed', match ? 'true' : 'false');
          });
          const statusEl = document.getElementById('editStatusCode');
          if (statusEl) statusEl.value = String(v.statusCode);
          if (editBody) {
            editBody.value = v.rawBody;
            editBody.classList.remove('json-editor-invalid');
          }
          const errorBanner = document.getElementById('jsonErrorBanner');
          if (errorBanner) errorBanner.classList.add('is-hidden');
          const saveBtn = document.getElementById('saveRouteBtn');
          if (saveBtn) saveBtn.disabled = false;
          if (formattedContainer) formattedContainer.innerHTML = syntaxHighlightJson(v.rawBody);
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
          renderInspector();
        }

        document.querySelectorAll('.scenario-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            applyScenarioSelection(btn.getAttribute('data-scenario'));
          });
        });

        const moreScenarioSelect = document.getElementById('moreScenarioSelect');
        if (moreScenarioSelect) {
          moreScenarioSelect.addEventListener('change', (e) => {
            if (e.target.value) {
              applyScenarioSelection(e.target.value);
            }
          });
        }

        const formatBtn = document.getElementById('formatJsonBtn');
        if (formatBtn && editBody) {
          formatBtn.addEventListener('click', () => {
            const errorBanner = document.getElementById('jsonErrorBanner');
            const saveBtn = document.getElementById('saveRouteBtn');
            try {
              const parsed = JSON.parse(editBody.value);
              const pretty = JSON.stringify(parsed, null, 2);
              editBody.value = pretty;
              editBody.classList.remove('json-editor-invalid');
              if (errorBanner) errorBanner.classList.add('is-hidden');
              if (saveBtn) saveBtn.disabled = false;
              if (formattedContainer) formattedContainer.innerHTML = syntaxHighlightJson(pretty);
              updatePayloadMetrics(pretty);
              isInspectorDirty = true;
            } catch (err) {
              if (errorBanner) {
                errorBanner.textContent = 'Cannot format invalid JSON: ' + err.message;
                errorBanner.classList.remove('is-hidden');
              }
            }
          });
        }

        const saveBtnEl = document.getElementById('saveRouteBtn');
        saveBtnEl.addEventListener('click', () => {
          const method = document.getElementById('editMethod').value;
          const urlPattern = document.getElementById('editUrlPattern').value.trim();
          const errorBanner = document.getElementById('jsonErrorBanner');
          if (!urlPattern) {
            if (errorBanner) {
              errorBanner.textContent = 'Cannot save route: URL Pattern cannot be empty.';
              errorBanner.classList.remove('is-hidden');
            }
            return;
          }
          const statusCode = parseInt(document.getElementById('editStatusCode').value, 10);
          const delayMs = parseInt(document.getElementById('editDelayMs').value, 10) || 0;
          const rawBody = document.getElementById('editBody').value;

          let parsedBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch (err) {
            if (errorBanner) {
              errorBanner.textContent = 'Cannot save route: Invalid JSON syntax (' + err.message + ')';
              errorBanner.classList.remove('is-hidden');
            }
            return;
          }

          let updatedVariants = route.variants;
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

          isInspectorDirty = false;
          hasExternalUpdatePending = false;
          vscode.postMessage({ type: 'saveRoute', route: savedRoute });
          selectedId = savedRoute.id;

          saveBtnEl.innerHTML = ICONS.check + ' <span>Saved</span>';
          saveBtnEl.classList.add('is-copied');
          setTimeout(() => {
            const currentSaveBtn = document.getElementById('saveRouteBtn');
            if (currentSaveBtn) {
              currentSaveBtn.innerHTML = ICONS.save + ' <span>Save</span>';
              currentSaveBtn.classList.remove('is-copied');
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

          const deleteBtn = document.getElementById('deleteRouteBtn');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              if (deleteBtn.getAttribute('data-confirm') !== 'true') {
                deleteBtn.setAttribute('data-confirm', 'true');
                deleteBtn.innerHTML = ICONS.trash + ' <span>Confirm?</span>';
                if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer);
                deleteConfirmTimer = setTimeout(() => {
                  const currentDel = document.getElementById('deleteRouteBtn');
                  if (currentDel) {
                    currentDel.removeAttribute('data-confirm');
                    currentDel.innerHTML = ICONS.trash + ' <span>Delete</span>';
                  }
                }, 3000);
                return;
              }
              if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer);
              isInspectorDirty = false;
              vscode.postMessage({ type: 'deleteRoute', routeId: route.id });
              selectedId = null;
              render();
            });
          }

          const copyPlaywrightBtn = document.getElementById('copyPlaywrightBtn');
          if (copyPlaywrightBtn) {
            copyPlaywrightBtn.addEventListener('click', () => {
              const globUrl = toPlaywrightGlob(route.urlPattern);
              const delayLine = route.delayMs && route.delayMs > 0
                ? '  await new Promise((resolve) => setTimeout(resolve, ' + route.delayMs + '));\\n'
                : '';
              const spec = \`await page.route('\${globUrl}', async (route) => {
\${delayLine}  await route.fulfill({
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
              const hasDelay = route.delayMs && route.delayMs > 0;
              const delayLine = hasDelay ? '  await delay(' + route.delayMs + ');\\n' : '';
              const handler = \`http.\${fn}('\${route.urlPattern}', \${hasDelay ? 'async ' : ''}() => {
\${delayLine}  return HttpResponse.json(\${bodyStr}, { status: \${route.statusCode} });
});\`;
              copyWithFeedback(copyMswBtn, handler, 'MSW v2 handler');
            });
          }
        }
      }
    }
  `;
}
