export function getWorkbenchStyles(): string {
  return `
    :root {
      --bg: var(--vscode-editor-background, #0e0e10);
      --surface: var(--vscode-sideBar-background, #141417);
      --fg: var(--vscode-editor-foreground, #e4e4e7);
      --muted: var(--vscode-descriptionForeground, #8b8b93);
      --border: var(--vscode-panel-border, var(--vscode-widget-border, #27272a));
      --input-bg: var(--vscode-input-background, #18181b);
      --input-fg: var(--vscode-input-foreground, #e4e4e7);
      --input-border: var(--vscode-input-border, var(--border));
      --hover-bg: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
      --selected-bg: var(--vscode-list-activeSelectionBackground, rgba(59, 130, 246, 0.12));
      --focus-border: var(--vscode-focusBorder, #3b82f6);
      --btn-bg: var(--vscode-button-background, #2563eb);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1d4ed8);
      --btn-sec-bg: transparent;
      --btn-sec-fg: var(--fg);
      --btn-sec-hover: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.12));
      --ui-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif);
      --code-font: var(--vscode-editor-font-family, 'Geist Mono', Consolas, 'SFMono-Regular', monospace);
      --success: var(--vscode-testing-iconPassed, #22c55e);
      --warning: var(--vscode-editorWarning-foreground, #eab308);
      --danger: var(--vscode-errorForeground, #ef4444);
      --offline-dot: #71717a;

      --method-get: #60a5fa;
      --method-post: #4ade80;
      --method-put: #facc15;
      --method-patch: #c084fc;
      --method-delete: #f87171;

      --status-2xx: #22c55e;
      --status-3xx: #60a5fa;
      --status-4xx: #eab308;
      --status-5xx: #ef4444;

      --json-string: #86efac;
      --json-number: #93c5fd;
      --json-boolean: #fca5a5;
    }

    body.vscode-light,
    body.vscode-high-contrast-light {
      --bg: var(--vscode-editor-background, #ffffff);
      --surface: var(--vscode-sideBar-background, #f3f3f3);
      --fg: var(--vscode-editor-foreground, #1f1f1f);
      --muted: var(--vscode-descriptionForeground, #5f6368);
      --border: var(--vscode-panel-border, #e0e0e0);
      --input-bg: var(--vscode-input-background, #ffffff);
      --input-fg: var(--vscode-input-foreground, #1f1f1f);
      --input-border: var(--vscode-input-border, #c8c8c8);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(0, 0, 0, 0.045));
      --selected-bg: var(--vscode-list-activeSelectionBackground, rgba(0, 95, 184, 0.1));
      --focus-border: var(--vscode-focusBorder, #005fb8);
      --btn-sec-fg: var(--fg);
      --btn-sec-hover: var(--vscode-toolbar-hoverBackground, rgba(0, 0, 0, 0.06));
      --success: #15803d;
      --warning: #b45309;
      --danger: #dc2626;
      --offline-dot: #8e8e93;

      --method-get: #005fb8;
      --method-post: #15803d;
      --method-put: #b45309;
      --method-patch: #7e22ce;
      --method-delete: #dc2626;

      --status-2xx: #15803d;
      --status-3xx: #005fb8;
      --status-4xx: #b45309;
      --status-5xx: #dc2626;

      --json-string: #166534;
      --json-number: #1d4ed8;
      --json-boolean: #b91c1c;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--ui-font);
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 12px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }

    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 8px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      gap: 12px;
      min-height: 40px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 13px;
      color: var(--fg);
      letter-spacing: -0.01em;
      flex-shrink: 0;
    }

    .brand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg);
    }

    .brand-tag {
      font-family: var(--code-font);
      font-size: 11px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 3px;
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
    }

    .top-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .status-cluster {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg);
      padding: 2px 4px 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--border);
      font-size: 11px;
      color: var(--muted);
      height: 24px;
    }

    .status-cluster strong {
      color: var(--fg);
      font-weight: 500;
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    .status-dot.online {
      background-color: var(--success);
    }

    .status-dot.offline {
      background-color: var(--offline-dot);
    }

    .status-dot.warning {
      background-color: var(--warning);
    }

    .info-tooltip-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      outline: none;
    }

    .info-badge {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      background: transparent;
      color: var(--muted);
      border: 1px solid var(--border);
      font-size: 10px;
      font-weight: 600;
      font-family: var(--code-font);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      user-select: none;
    }

    .info-tooltip-wrap:hover .info-badge,
    .info-tooltip-wrap:focus-within .info-badge {
      color: var(--fg);
      border-color: var(--muted);
    }

    .info-popover {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      width: 300px;
      background: var(--surface);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      z-index: 9999;
      font-size: 11px;
      line-height: 1.45;
      text-align: left;
      pointer-events: none;
    }

    .info-tooltip-wrap:hover .info-popover,
    .info-tooltip-wrap:focus-within .info-popover {
      display: block;
    }

    .info-popover-title {
      font-weight: 600;
      font-size: 11px;
      color: var(--fg);
      margin-bottom: 4px;
    }

    .info-popover p {
      margin: 0 0 6px 0;
      color: var(--muted);
    }

    .info-popover ul {
      margin: 0;
      padding-left: 14px;
      color: var(--muted);
    }

    .info-popover li {
      margin-bottom: 3px;
    }

    .info-popover code {
      font-family: var(--code-font);
      color: var(--fg);
    }

    button {
      background: var(--btn-sec-bg);
      color: var(--btn-sec-fg);
      border: 1px solid var(--border);
      padding: 4px 10px;
      height: 24px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-family: var(--ui-font);
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
      user-select: none;
      white-space: nowrap;
    }

    button:hover:not(:disabled) {
      background: var(--btn-sec-hover);
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

    button.primary,
    button.accent {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border-color: transparent;
      font-weight: 500;
    }

    button.primary:hover:not(:disabled),
    button.accent:hover:not(:disabled) {
      background: var(--btn-hover);
      border-color: transparent;
    }

    button.danger {
      background: transparent;
      border-color: var(--border);
      color: var(--danger);
    }

    button.danger:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.1);
      border-color: var(--danger);
    }

    button.btn-compact {
      padding: 2px 7px;
      height: 18px;
      font-size: 11px;
      border-radius: 3px;
    }

    .filter-bar button.btn-compact,
    .banner-bar button.btn-compact,
    .inspector-body button.btn-compact {
      height: 22px;
      padding: 2px 8px;
    }

    button.btn-success {
      background: var(--selected-bg) !important;
      color: var(--fg) !important;
      border-color: var(--focus-border) !important;
      font-weight: 600;
    }

    .workbench-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    .left-pane {
      width: 420px;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      background: var(--bg);
    }

    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      height: 36px;
      flex-shrink: 0;
    }

    .tab {
      flex: 1;
      height: 100%;
      padding: 0 8px;
      text-align: center;
      cursor: pointer;
      font-weight: 500;
      font-size: 11px;
      color: var(--muted);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      border-radius: 0;
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: color 0.1s ease, border-color 0.1s ease, background 0.1s ease;
    }

    .tab:hover {
      color: var(--fg);
      background: var(--hover-bg);
      border-color: transparent;
    }

    .tab.active {
      color: var(--fg);
      border-bottom-color: var(--focus-border);
      background: var(--bg);
      font-weight: 600;
    }

    .tab-count {
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
      font-size: 10px;
      color: var(--muted);
      padding: 1px 5px;
      border-radius: 3px;
      background: var(--hover-bg);
    }

    .tab.active .tab-count {
      color: var(--fg);
    }

    .filter-bar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 6px;
      align-items: center;
      background: var(--bg);
      flex-shrink: 0;
    }

    input[type="text"],
    input[type="number"],
    select,
    textarea {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--input-border);
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-family: var(--ui-font);
      transition: border-color 0.1s ease;
    }

    input[readonly] {
      color: var(--fg);
      background: var(--surface);
      cursor: default;
    }

    input[type="text"]:focus,
    input[type="number"]:focus,
    select:focus,
    textarea:focus {
      outline: none;
      border-color: var(--focus-border);
    }

    .search-input {
      flex: 1;
      height: 24px;
      min-width: 0;
    }

    .filter-bar select {
      height: 24px;
      padding: 2px 6px;
      font-size: 11px;
    }

    .item-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .list-card {
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border);
      border-left: 2px solid transparent;
      border-radius: 0;
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: background 0.08s ease;
    }

    .list-card:hover {
      background: var(--hover-bg);
    }

    .list-card.selected {
      border-left-color: var(--focus-border);
      background: rgba(59, 130, 246, 0.12);
    }

    body.vscode-light .list-card.selected,
    body.vscode-high-contrast-light .list-card.selected {
      background: rgba(0, 95, 184, 0.08);
    }

    .list-card:focus-visible {
      outline: 1px solid var(--focus-border);
      outline-offset: -1px;
    }

    .list-card.disabled-route .path-text {
      color: var(--muted);
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .method-tag {
      font-family: var(--code-font);
      font-weight: 600;
      font-size: 11px;
      width: 44px;
      text-transform: uppercase;
      flex-shrink: 0;
      background: transparent;
      padding: 0;
    }

    .tag-get { color: var(--method-get); }
    .tag-post { color: var(--method-post); }
    .tag-put { color: var(--method-put); }
    .tag-patch { color: var(--method-patch); }
    .tag-delete { color: var(--method-delete); }
    .tag-other { color: var(--muted); }

    .path-text {
      font-family: var(--code-font);
      font-size: 12px;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg);
    }

    .status-code-tag {
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      font-size: 11px;
      padding: 0 4px;
      flex-shrink: 0;
    }

    .status-2xx { color: var(--status-2xx); }
    .status-3xx { color: var(--status-3xx); }
    .status-4xx { color: var(--status-4xx); }
    .status-5xx { color: var(--status-5xx); }

    .card-sub {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
      padding-left: 52px;
      gap: 8px;
    }

    .type-tag {
      color: var(--muted);
      font-family: var(--code-font);
      font-size: 11px;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .mock-status-pill {
      font-size: 11px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-family: var(--code-font);
    }

    .mock-status-pill.mocked { color: var(--success); }
    .mock-status-pill.pass { color: var(--muted); }

    .route-toggle-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 6px;
      height: 18px;
      border-radius: 3px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      font-size: 11px;
      cursor: pointer;
    }

    .route-toggle-pill:hover {
      border-color: var(--border);
      background: var(--btn-sec-hover);
      color: var(--fg);
    }

    .right-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
      min-width: 0;
    }

    .inspector-header {
      padding: 8px 16px;
      min-height: 40px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--surface);
      gap: 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .inspector-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
    }

    .inspector-title span.path-display {
      font-family: var(--code-font);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--fg);
    }

    .inspector-actions {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .inspector-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .form-row {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }

    .form-group label,
    .form-group .field-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .input-with-action {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .input-with-action input {
      flex: 1;
      min-width: 0;
      font-family: var(--code-font);
      font-size: 11.5px;
    }

    .status-toggle-btn {
      width: 100%;
      height: 27px;
      justify-content: flex-start;
      padding: 4px 10px;
      font-family: var(--ui-font);
      font-size: 12px;
      background: var(--input-bg);
      border-color: var(--input-border);
    }

    .json-editor {
      font-family: var(--code-font);
      font-size: 12px;
      min-height: 260px;
      resize: vertical;
      line-height: 1.5;
      white-space: pre;
      tab-size: 2;
    }

    .empty-prompt {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      color: var(--muted);
      gap: 8px;
      padding: 32px 16px;
      text-align: center;
    }

    .empty-prompt strong {
      color: var(--fg);
      font-size: 12.5px;
      font-weight: 600;
    }

    .empty-icon-wrapper {
      width: 36px;
      height: 36px;
      border-radius: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .empty-icon-wrapper svg {
      width: 16px;
      height: 16px;
    }

    .feature-pills {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      max-width: 580px;
      text-align: left;
    }

    .feature-card {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      line-height: 1.45;
      color: var(--muted);
    }

    .feature-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--fg);
      font-size: 11px;
    }

    .tab-content-panel {
      background: var(--input-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 8px 10px;
      font-family: var(--code-font);
      font-size: 11.5px;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.45;
    }

    .banner-bar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
      flex-shrink: 0;
    }

    .banner-bar strong {
      color: var(--fg);
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
    }

    .info-callout {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 2px solid var(--focus-border);
      padding: 8px 12px;
      border-radius: 3px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
    }

    .info-callout strong {
      color: var(--fg);
    }

    .info-callout code {
      font-family: var(--code-font);
      color: var(--fg);
    }

    .pane-resizer {
      width: 4px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.1s ease;
      z-index: 10;
      flex-shrink: 0;
    }

    .pane-resizer:hover,
    .pane-resizer.resizing {
      background: var(--focus-border);
    }

    .json-token-key { color: var(--fg); font-weight: 500; }
    .json-token-string { color: var(--json-string); }
    .json-token-number { color: var(--json-number); font-variant-numeric: tabular-nums; }
    .json-token-boolean { color: var(--json-boolean); }
    .json-token-null { color: var(--muted); }

    .json-formatted-view {
      font-family: var(--code-font);
      font-size: 12px;
      color: var(--fg);
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 10px 12px;
      max-height: 340px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.5;
      user-select: text;
      cursor: text;
    }

    .json-formatted-view:hover {
      border-color: var(--muted);
    }

    .metric-pill {
      font-size: 11px;
      color: var(--muted);
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
    }

    .editor-mode-toggle {
      display: inline-flex;
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }

    .editor-mode-toggle button {
      border: none;
      border-radius: 0;
      padding: 2px 8px;
      height: 20px;
      font-size: 11px;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }

    .editor-mode-toggle button.active {
      background: var(--selected-bg);
      color: var(--fg);
      font-weight: 600;
    }

    details.advanced-accordion {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 3px;
      overflow: hidden;
    }

    details.advanced-accordion summary {
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      list-style: none;
    }

    details.advanced-accordion summary::-webkit-details-marker {
      display: none;
    }

    details.advanced-accordion summary:hover {
      color: var(--fg);
    }

    details.advanced-accordion summary:focus-visible {
      outline: 1px solid var(--focus-border);
      outline-offset: -1px;
    }

    details.advanced-accordion[open] summary svg {
      transform: rotate(90deg);
    }

    details.advanced-accordion summary svg {
      transition: transform 0.1s ease;
    }

    .advanced-content {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--border);
      background: var(--bg);
    }

    .scenario-help-note {
      font-size: 11px;
      color: var(--muted);
      padding: 4px 0 0 0;
      line-height: 1.4;
    }

    .skeleton-line {
      height: 10px;
      background: var(--hover-bg);
      border-radius: 2px;
    }

    .skeleton-card {
      opacity: 0.6;
      cursor: default;
    }

    .error-banner {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid var(--danger);
      color: var(--danger);
      padding: 6px 10px;
      border-radius: 3px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
}
