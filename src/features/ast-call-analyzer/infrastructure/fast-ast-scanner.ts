import * as ts from 'typescript';
import type { DetectedApiCall, HttpMethod, ApiClientType } from '../../../shared/kernel/index';

function extractStringValue(node: ts.Node | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      result += `:${span.expression.getText(sourceFile)}` + span.literal.text;
    }
    return result;
  }
  if (ts.isIdentifier(node)) {
    return node.getText(sourceFile);
  }
  return undefined;
}

function extractMethodFromOptions(optionsNode: ts.Node | undefined, sourceFile: ts.SourceFile): HttpMethod | undefined {
  if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) {
    return undefined;
  }

  for (const prop of optionsNode.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name) {
      const propName = prop.name.getText(sourceFile).replace(/['"]/g, '');
      if (propName.toLowerCase() === 'method') {
        const val = extractStringValue(prop.initializer, sourceFile);
        if (val) {
          const upper = val.toUpperCase();
          if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(upper)) {
            return upper as HttpMethod;
          }
        }
      }
    }
  }

  return undefined;
}

export function detectApiCalls(documentText: string, fileName: string = 'file.ts'): DetectedApiCall[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    documentText,
    ts.ScriptTarget.Latest,
    false // setParentNodes = false for 3x speedup
  );

  const results: DetectedApiCall[] = [];
  let callIndex = 0;

  function recordCall(
    node: ts.Node,
    method: HttpMethod,
    url: string,
    clientType: ApiClientType,
    typeArgument?: string
  ) {
    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    results.push({
      id: `call_${callIndex++}_${startPos.line}_${startPos.character}`,
      method,
      url,
      clientType,
      typeArgument,
      range: {
        start: { line: startPos.line, character: startPos.character },
        end: { line: endPos.line, character: endPos.character },
      },
      rawExpression: node.getText(sourceFile),
      fileName,
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      if (ts.isIdentifier(expr) && expr.text === 'fetch') {
        const urlArg = node.arguments[0];
        const optionsArg = node.arguments[1];
        const url = extractStringValue(urlArg, sourceFile);
        if (url) {
          const method = extractMethodFromOptions(optionsArg, sourceFile) || 'GET';
          let typeArg: string | undefined;
          if (node.typeArguments && node.typeArguments.length > 0) {
            typeArg = node.typeArguments[0]!.getText(sourceFile);
          }
          recordCall(node, method, url, 'fetch', typeArg);
        }
      }

      else if (ts.isPropertyAccessExpression(expr)) {
        const objText = expr.expression.getText(sourceFile);
        const propName = expr.name.text.toLowerCase();

        const isAxios = objText === 'axios' || objText.endsWith('Axios') || objText.endsWith('Client') || objText === 'api';
        const isHttpVerb = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(propName);

        if (isAxios && isHttpVerb) {
          const urlArg = node.arguments[0];
          const url = extractStringValue(urlArg, sourceFile);
          if (url) {
            let typeArg: string | undefined;
            if (node.typeArguments && node.typeArguments.length > 0) {
              typeArg = node.typeArguments[0]!.getText(sourceFile);
            }
            recordCall(node, propName.toUpperCase() as HttpMethod, url, 'axios', typeArg);
          }
        }

        const isAngularHttp =
          (objText === 'this.http' || objText === 'this.httpClient' || objText === 'http' || objText === 'httpClient') &&
          isHttpVerb;

        if (isAngularHttp) {
          const urlArg = node.arguments[0];
          const url = extractStringValue(urlArg, sourceFile);
          if (url) {
            let typeArg: string | undefined;
            if (node.typeArguments && node.typeArguments.length > 0) {
              typeArg = node.typeArguments[0]!.getText(sourceFile);
            }
            recordCall(node, propName.toUpperCase() as HttpMethod, url, 'angular-http', typeArg);
          }
        }
      }

      else if (ts.isIdentifier(expr) && (expr.text === 'useQuery' || expr.text === 'useMutation')) {
        let typeArg: string | undefined;
        if (node.typeArguments && node.typeArguments.length > 0) {
          typeArg = node.typeArguments[0]!.getText(sourceFile);
        }

        let inferredUrl: string | undefined;
        const firstArg = node.arguments[0];

        if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
          for (const prop of firstArg.properties) {
            if (ts.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'queryKey') {
              if (ts.isArrayLiteralExpression(prop.initializer)) {
                const firstElement = prop.initializer.elements[0];
                inferredUrl = extractStringValue(firstElement, sourceFile);
              }
            }
          }
        } else if (firstArg && ts.isArrayLiteralExpression(firstArg)) {
          const firstElement = firstArg.elements[0];
          inferredUrl = extractStringValue(firstElement, sourceFile);
        }

        if (inferredUrl) {
          const isMutation = expr.text === 'useMutation';
          recordCall(node, isMutation ? 'POST' : 'GET', inferredUrl, 'useQuery', typeArg);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}
