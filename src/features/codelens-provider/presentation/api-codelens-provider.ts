import * as vscode from 'vscode';
import { detectApiCalls } from '../../ast-call-analyzer/index';
import type { DetectedApiCall } from '../../../shared/kernel/index';

export class ApiCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly cachedCalls: Map<string, DetectedApiCall[]> = new Map();

  public provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const uriKey = document.uri.toString();

    const calls = detectApiCalls(document.getText(), document.fileName);
    this.cachedCalls.set(uriKey, calls);

    const lenses: vscode.CodeLens[] = [];

    for (const call of calls) {
      const line = call.range.start.line;
      const range = new vscode.Range(line, 0, line, 0);

      lenses.push(
        new vscode.CodeLens(range, {
          title: `⚡ Mock API (${call.method} ${call.url})`,
          command: 'mockscope.mockCall',
          arguments: [call, document.getText()],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '📋 Playwright',
          command: 'mockscope.copyPlaywrightSpec',
          arguments: [call, document.getText()],
        })
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: '📋 MSW v2',
          command: 'mockscope.copyMswHandler',
          arguments: [call, document.getText()],
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
