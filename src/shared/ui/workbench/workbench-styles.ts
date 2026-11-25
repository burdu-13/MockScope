export function getWorkbenchStyles(): string {
  return `
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --surface: var(--vscode-sideBar-background, #252526);
      --fg: var(--vscode-editor-foreground, #cccccc);
      --muted: var(--vscode-descriptionForeground, #8b8b93);
      --border: var(--vscode-panel-border, var(--vscode-widget-border, #333333));
      --input-bg: var(--vscode-input-background, #18181b);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --input-border: var(--vscode-input-border, var(--border));
      --hover-bg: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.08));
      --selected-bg: var(--vscode-list-activeSelectionBackground, rgba(0, 122, 204, 0.16));
      --focus-border: var(--vscode-focusBorder, #007acc);
      --btn-bg: var(--vscode-button-background, #0e639c);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
      --btn-sec-bg: transparent;
      --btn-sec-fg: var(--fg);
      --btn-sec-hover: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.12));
      --ui-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      --code-font: var(--vscode-editor-font-family, Consolas, 'SFMono-Regular', monospace);
      --success: var(--vscode-testing-iconPassed, #22c55e);
      --warning: var(--vscode-editorWarning-foreground, #eab308);
      --danger: var(--vscode-errorForeground, #ef4444);

      --json-string: var(--vscode-debugTokenExpression-string, #ce9178);
      --json-number: var(--vscode-debugTokenExpression-number, #b5cea8);
      --json-boolean: var(--vscode-debugTokenExpression-boolean, #569cd6);
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
      --json-string: #a31515;
      --json-number: #098658;
      --json-boolean: #0000ff;
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
      padding: 0 12px;
      height: 36px;
      min-height: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      gap: 12px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      overflow: hidden;
    }

    .brand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg);
      flex-shrink: 0;
    }

    .brand-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--fg);
      letter-spacing: -0.01em;
      flex-shrink: 0;
    }

    .brand-meta {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .top-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .status-strip {
      display: inline-flex;
      align-items: center;
    }

    .status-item {
      border: none;
      border-radius: 2px;
      background: transparent;
      color: var(--muted);
      height: 24px;
      padding: 0 8px;
      font-size: 11px;
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      white-space: nowrap;
    }

    .status-item + .status-item {
      border-left: 1px solid var(--border);
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }

    .status-item:hover:not(:disabled) {
      background: var(--hover-bg);
      color: var(--fg);
      border-color: var(--border);
    }

    .status-item[aria-pressed="true"] {
      color: var(--fg);
    }

    .header-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding-left: 8px;
      border-left: 1px solid var(--border);
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

    .status-dot.warning {
      background-color: var(--warning);
    }

    @media (max-width: 860px) {
      .brand-meta {
        display: none;
      }
    }

    @media (max-width: 720px) {
      header {
        height: auto;
        padding: 6px 12px;
        flex-wrap: wrap;
        gap: 6px;
      }

      .top-controls {
        flex-wrap: wrap;
      }
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
      background: var(--vscode-inputValidation-errorBackground, rgba(239, 68, 68, 0.1));
      border-color: var(--danger);
    }

    button.btn-compact {
      padding: 2px 8px;
      height: 20px;
      font-size: 11px;
      border-radius: 3px;
    }

    .filter-bar button.btn-compact,
    .banner-bar button.btn-compact,
    .inspector-body button.btn-compact {
      height: 22px;
      padding: 2px 8px;
    }

    button.is-selected {
      background: var(--selected-bg);
      color: var(--fg);
      border-color: var(--focus-border);
      font-weight: 600;
    }

    button.is-copied {
      color: var(--success);
      border-color: var(--success);
    }

    button.inline-link-btn {
      background: transparent;
      border: none;
      padding: 0;
      height: auto;
      font-size: 11px;
      font-family: var(--code-font);
      color: var(--muted);
      cursor: pointer;
    }

    button.inline-link-btn:hover:not(:disabled) {
      background: transparent;
      color: var(--fg);
      text-decoration: underline;
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

    .list-row {
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--border);
      border-left: 2px solid transparent;
      border-radius: 0;
      padding: 6px 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: background 0.08s ease;
    }

    .list-row:hover {
      background: var(--hover-bg);
    }

    .list-row.selected {
      border-left-color: var(--focus-border);
      background: var(--selected-bg);
    }

    .list-row:focus-visible {
      outline: 1px solid var(--focus-border);
      outline-offset: -1px;
    }

    .list-row.disabled-route .path-text {
      color: var(--muted);
    }

    .row-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .method-tag {
      font-family: var(--code-font);
      font-weight: 600;
      font-size: 11px;
      width: 46px;
      text-transform: uppercase;
      flex-shrink: 0;
      color: var(--muted);
      padding: 0;
    }

    .method-tag.is-mutating {
      color: var(--fg);
    }

    .path-text {
      font-family: var(--code-font);
      font-size: 12px;
      flex: 1;
      min-width: 0;
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
      padding: 0 2px;
      flex-shrink: 0;
      color: var(--muted);
    }

    .status-4xx { color: var(--warning); }
    .status-5xx { color: var(--danger); }

    .row-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
      padding-left: 54px;
      gap: 8px;
      min-width: 0;
    }

    .row-meta-left {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }

    .row-source-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--code-font);
      font-size: 11px;
    }

    .type-tag-btn {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex-shrink: 0;
    }

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

    dl.kv-list {
      display: grid;
      grid-template-columns: 116px 1fr;
      margin: 0;
      border-top: 1px solid var(--border);
    }

    dl.kv-list dt {
      padding: 7px 8px 7px 0;
      font-size: 11px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      font-weight: 500;
    }

    dl.kv-list dd {
      margin: 0;
      padding: 7px 0;
      font-family: var(--code-font);
      font-size: 11.5px;
      color: var(--fg);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    .kv-value-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .inspector-section {
      border-top: 1px solid var(--border);
      padding-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    details.inspector-section > summary {
      cursor: pointer;
      user-select: none;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
    }

    details.inspector-section > summary::-webkit-details-marker {
      display: none;
    }

    details.inspector-section > summary:hover {
      color: var(--fg);
    }

    .summary-title-group {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    details.inspector-section > summary svg.chevron-icon {
      transition: transform 0.1s ease;
    }

    details.inspector-section[open] > summary svg.chevron-icon {
      transform: rotate(90deg);
    }

    .code-surface {
      background: var(--input-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 8px 10px;
      font-family: var(--code-font);
      font-size: 11.5px;
      line-height: 1.5;
      max-height: 240px;
      overflow: auto;
      white-space: pre;
      tab-size: 2;
      margin: 0;
    }

    .code-surface-wrap {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
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

    .empty-kbd-inline {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
      margin-top: 4px;
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

    .scenario-segmented {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .scenario-more-select {
      height: 22px;
      padding: 1px 6px;
      font-size: 11px;
      color: var(--muted);
    }

    .latency-links {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }

    .mfa-inline-hint {
      font-size: 11px;
      color: var(--muted);
      font-family: var(--code-font);
    }

    .error-banner {
      background: var(--vscode-inputValidation-errorBackground, rgba(239, 68, 68, 0.08));
      border: 1px solid var(--vscode-inputValidation-errorBorder, var(--danger));
      color: var(--danger);
      padding: 8px 12px;
      border-radius: 3px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .is-hidden {
      display: none !important;
    }

    .flex-1 {
      flex: 1;
      min-width: 0;
    }

    .w-140 {
      width: 140px;
    }

    .w-150 {
      width: 150px;
    }

    .mt-6 {
      margin-top: 8px;
    }

    .py-30 {
      padding: 28px 12px;
    }

    .empty-sub {
      max-width: 280px;
      font-size: 11px;
    }

    .empty-title-lg {
      color: var(--fg);
      font-size: 13px;
      font-weight: 600;
    }

    .empty-desc-lg {
      font-size: 12px;
      color: var(--muted);
      max-width: 360px;
    }

    .inspector-row-between {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      gap: 8px;
    }

    .inspector-row-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .inspector-sublabel {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
    }

    .json-editor-invalid {
      border-color: var(--danger) !important;
    }

    .traffic-toolbar-extra {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background: var(--surface);
      flex-shrink: 0;
    }

    .status-filter-group {
      display: inline-flex;
      gap: 4px;
    }

    .status-chip.active,
    #pauseTrafficBtn.active {
      background: var(--selected-bg);
      color: var(--fg);
      border-color: var(--focus-border);
    }

    .traffic-duration {
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
    }

    .traffic-duration.is-slow {
      color: var(--warning);
      font-weight: 600;
    }

    .dirty-banner {
      background: var(--surface);
      border: 1px solid var(--warning);
      color: var(--fg);
      padding: 6px 12px;
      border-radius: 3px;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    .model-header-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }

    .model-kind-text {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
    }

    .model-file-loc {
      font-family: var(--code-font);
      font-size: 11px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .related-models-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
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
