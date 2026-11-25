import * as vscode from 'vscode';
import type { DetectedApiCall, MockRoute } from '../../../shared/kernel/index';

export type ApiCallDetector = (documentText: string, fileName?: string) => DetectedApiCall[];
export type ActiveRoutesProvider = () => MockRoute[];

interface CachedDocumentCalls {
  version: number;
  calls: DetectedApiCall[];
}

const MAX_CACHED_DOCUMENTS = 50;

export class ApiCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly cachedCalls: Map<string, CachedDocumentCalls> = new Map();

  constructor(
    private readonly detectCalls: ApiCallDetector,
    private readonly getActiveRoutes?: ActiveRoutesProvider
  ) {}

  public getCallsForDocument(document: vscode.TextDocument): DetectedApiCall[] {
    const uriKey = document.uri.toString();
    const cached = this.cachedCalls.get(uriKey);
    if (cached && cached.version === document.version) {
      return cached.calls;
    }

    const calls = this.detectCalls(document.getText(), document.fileName);
    if (this.cachedCalls.size >= MAX_CACHED_DOCUMENTS && !this.cachedCalls.has(uriKey)) {
      const oldestKey = this.cachedCalls.keys().next().value;
      if (oldestKey !== undefined) {
        this.cachedCalls.delete(oldestKey);
      }
    }
    this.cachedCalls.set(uriKey, { version: document.version, calls });
    return calls;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration('mockscope');
    const isEnabled = config.get<boolean>('enableCodeLens', true);
    if (!isEnabled) {
      return [];
    }

    const mode = config.get<'compact' | 'expanded'>('codeLensMode', 'compact');
    const calls = this.getCallsForDocument(document);
    const routes = this.getActiveRoutes ? this.getActiveRoutes() : [];
    const lenses: vscode.CodeLens[] = [];
    const sourceText = document.getText();

    for (const call of calls) {
      const line = call.range.start.line;
      const range = new vscode.Range(line, 0, line, 0);
      const matchedRoute = routes.find(
        (r) =>
          r.enabled !== false &&
          r.urlPattern === call.url &&
          (r.method === call.method || r.method === '*')
      );

      if (mode === 'compact') {
        const title = matchedRoute
          ? `$(circle-filled) Mocked: ${matchedRoute.statusCode} ${matchedRoute.scenario || 'custom'}${matchedRoute.delayMs ? ` (${matchedRoute.delayMs}ms)` : ''} · Actions`
          : `$(radio-tower) Mock ${call.method} ${call.url}`;

        lenses.push(
          new vscode.CodeLens(range, {
            title,
            command: 'mockscope.callActions',
            arguments: [call, sourceText, matchedRoute],
          })
        );
        continue;
      }

      lenses.push(
        new vscode.CodeLens(range, {
          title: matchedRoute
            ? `$(circle-filled) Mocked (${matchedRoute.statusCode})`
            : `$(radio-tower) Mock API (${call.method} ${call.url})`,
          command: 'mockscope.mockCall',
          arguments: [call, sourceText],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(window) Workbench',
          command: 'mockscope.openWorkbench',
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(globe) Preview',
          command: 'mockscope.openInBrowser',
          arguments: [call.url],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(copy) Playwright',
          command: 'mockscope.copyPlaywrightSpec',
          arguments: [call, sourceText],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(copy) MSW',
          command: 'mockscope.copyMswHandler',
          arguments: [call, sourceText],
        })
      );
    }

    return lenses;
  }

  public triggerDebouncedRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this._onDidChangeCodeLenses.fire();
    }, 300);
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this._onDidChangeCodeLenses.dispose();
    this.cachedCalls.clear();
  }
}
