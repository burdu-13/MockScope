import * as vscode from 'vscode';
import type { DetectedApiCall } from '../../../shared/kernel/index';
import type { ActiveRoutesProvider, ApiCallDetector } from './api-codelens-provider';

export type PreviewSynthesizer = (call: DetectedApiCall, sourceText: string) => unknown;

export class ApiHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly detectCalls: ApiCallDetector,
    private readonly getActiveRoutes: ActiveRoutesProvider,
    private readonly synthesizePreview: PreviewSynthesizer,
    private readonly getCachedCalls?: (document: vscode.TextDocument) => DetectedApiCall[]
  ) {}

  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const calls = this.getCachedCalls
      ? this.getCachedCalls(document)
      : this.detectCalls(document.getText(), document.fileName);

    const hit = calls.find(
      (c) =>
        position.line >= c.range.start.line &&
        position.line <= c.range.end.line
    );
    if (!hit) {
      return undefined;
    }

    const routes = this.getActiveRoutes();
    const matched = routes.find(
      (r) =>
        r.urlPattern === hit.url &&
        (r.method === hit.method || r.method === '*')
    );

    const previewData = matched
      ? matched.body
      : this.synthesizePreview(hit, document.getText());
    const previewLines = JSON.stringify(previewData ?? {}, null, 2).split('\n');
    const truncated =
      previewLines.length > 14
        ? [...previewLines.slice(0, 14), '  ...'].join('\n')
        : previewLines.join('\n');

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;

    const statusLine = matched
      ? matched.enabled !== false
        ? `**Active Mock:** \`${matched.statusCode}\` (${matched.scenario || 'custom'}${matched.delayMs ? `, ${matched.delayMs}ms` : ''})`
        : `**Mock Paused** (${matched.statusCode})`
      : '**Status:** Unmocked (click CodeLens or command below to synthesize)';

    md.appendMarkdown(`**MockScope** · \`${hit.method} ${hit.url}\` · \`${hit.clientType}\`\n\n`);
    if (hit.typeArgument || hit.inferredShape) {
      md.appendMarkdown(`**Contract:** \`${hit.typeArgument || hit.inferredShape}\` · ${statusLine}\n\n`);
    } else {
      md.appendMarkdown(`${statusLine}\n\n`);
    }
    md.appendCodeblock(truncated, 'json');

    const actionArgs = encodeURIComponent(JSON.stringify([hit, document.getText(), matched]));
    md.appendMarkdown(
      `\n[Actions...](command:mockscope.callActions?${actionArgs}) · [Open Workbench](command:mockscope.openWorkbench)`
    );

    const range = new vscode.Range(
      hit.range.start.line,
      hit.range.start.character,
      hit.range.end.line,
      hit.range.end.character
    );
    return new vscode.Hover(md, range);
  }
}
