
export function getWorkbenchStyles(): string {
  return `
    :root {
      --bg: var(--vscode-editor-background, #0e0e10);
      --surface: var(--vscode-sideBar-background, #141417);
      --fg: var(--vscode-editor-foreground, #e4e4e7);
      --muted: var(--vscode-descriptionForeground, #8b8b93);
      --border: var(--vscode-panel-border, #27272a);
      --input-bg: var(--vscode-input-background, #18181b);
      --input-fg: var(--vscode-input-foreground, #e4e4e7);
      --input-border: var(--vscode-input-border, #27272a);
      --hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.035));
      --selected-bg: var(--vscode-list-activeSelectionBackground, rgba(255, 255, 255, 0.06));
      --focus-border: var(--vscode-focusBorder, #3b82f6);
      --btn-bg: var(--vscode-button-background, #2563eb);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #1d4ed8);
      --btn-sec-bg: transparent;
      --btn-sec-fg: var(--fg);
      --btn-sec-hover: rgba(255, 255, 255, 0.06);
      --ui-font: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif);
      --code-font: var(--vscode-editor-font-family, 'Geist Mono', Consolas, 'SFMono-Regular', monospace);
      --success: #22c55e;
      --warning: #eab308;
      --danger: #ef4444;
    }

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
    }

    .brand-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
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
      gap: 8px;
      flex-wrap: wrap;
    }

    .status-cluster {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      padding: 2px 8px;
      border-radius: 3px;
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
      background-color: #52525b;
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
      width: 14px;
      height: 14px;
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
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
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

    button:hover {
      background: var(--btn-sec-hover);
      border-color: var(--muted);
    }

    button:focus-visible {
      outline: 1px solid var(--focus-border);
      outline-offset: 1px;
    }

    button:disabled {
      opacity: 0.5;
      cursor: default;
    }

    button.primary,
    button.accent {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border-color: transparent;
      font-weight: 500;
    }

    button.primary:hover,
    button.accent:hover {
      background: var(--btn-hover);
      border-color: transparent;
    }

    button.danger {
      background: transparent;
      border-color: var(--border);
      color: var(--danger);
    }

    button.danger:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: var(--danger);
    }

    button.btn-compact {
      padding: 2px 7px;
      height: 20px;
      font-size: 11px;
    }

    button.btn-success {
      background: var(--selected-bg) !important;
      color: var(--fg) !important;
      border-color: var(--fg) !important;
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
      height: 34px;
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
      transition: color 0.1s ease, border-color 0.1s ease;
    }

    .tab:hover {
      color: var(--fg);
      background: transparent;
      border-color: transparent;
    }

    .tab.active {
      color: var(--fg);
      border-bottom-color: var(--fg);
      background: var(--bg);
      font-weight: 600;
    }

    .tab-count {
      font-family: var(--code-font);
      font-variant-numeric: tabular-nums;
      font-size: 10px;
      color: var(--muted);
    }

    .filter-bar {
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      display: flex;
      gap: 6px;
      align-items: center;
      background: var(--bg);
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
      color: var(--muted);
      background: transparent;
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
      background: var(--selected-bg);
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
      width: 42px;
      text-transform: uppercase;
      flex-shrink: 0;
      background: transparent;
      padding: 0;
    }

    .tag-get { color: #60a5fa; }
    .tag-post { color: #4ade80; }
    .tag-put { color: #facc15; }
    .tag-patch { color: #c084fc; }
    .tag-delete { color: #f87171; }
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
    }

    .status-2xx { color: var(--success); }
    .status-3xx { color: #60a5fa; }
    .status-4xx { color: var(--warning); }
    .status-5xx { color: var(--danger); }

    .card-sub {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
      padding-left: 50px;
    }

    .type-tag {
      color: var(--muted);
      font-family: var(--code-font);
      font-size: 11px;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    .right-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
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
    }

    .inspector-title {
      font-size: 12px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
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
      gap: 4px;
    }

    .form-row {
      display: flex;
      gap: 12px;
    }

    .form-group label {
      font-size: 11px;
      font-weight: 500;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .json-editor {
      font-family: var(--code-font);
      font-size: 12px;
      min-height: 260px;
      resize: vertical;
      line-height: 1.5;
      white-space: pre;
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

    .empty-icon-wrapper {
      width: 36px;
      height: 36px;
      border-radius: 4px;
      background: transparent;
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
      max-width: 560px;
      text-align: left;
    }

    .feature-card {
      flex: 1;
      background: transparent;
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
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 8px 10px;
      font-family: var(--code-font);
      font-size: 11.5px;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
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
    }

    .banner-bar strong {
      color: var(--fg);
      font-family: var(--code-font);
    }

    .info-callout {
      background: transparent;
      border: 1px solid var(--border);
      padding: 8px 12px;
      border-radius: 3px;
      font-size: 11px;
      color: var(--muted);
      line-height: 1.45;
    }

    .info-callout strong {
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
    .json-token-string { color: #86efac; }
    .json-token-number { color: #93c5fd; font-variant-numeric: tabular-nums; }
    .json-token-boolean { color: #fca5a5; }
    .json-token-null { color: var(--muted); }

    .json-formatted-view {
      font-family: var(--code-font);
      font-size: 12px;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 3px;
      padding: 10px 12px;
      max-height: 320px;
      overflow-y: auto;
      white-space: pre-wrap;
      line-height: 1.5;
      user-select: text;
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
    }

    details.advanced-accordion summary:hover {
      color: var(--fg);
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
    }

    .scenario-help-note {
      font-size: 11px;
      color: var(--muted);
      padding: 6px 0 0 0;
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
        transition: none !important;
        animation: none !important;
      }
    }
  `;
}
