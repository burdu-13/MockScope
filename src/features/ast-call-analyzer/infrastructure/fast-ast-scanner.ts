import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { DetectedApiCall, HttpMethod, ApiClientType } from '../../../shared/kernel/index';

function normalizeUrlPath(rawPath: string): string {
  let cleaned = rawPath.trim();
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      const u = new URL(cleaned);
      cleaned = u.pathname;
    } catch {
      cleaned = cleaned.replace(/^https?:\/\/[^/]+/, '');
    }
  }
  cleaned = cleaned.replace(/\{([a-zA-Z0-9_]+)\}/g, ':$1');
  if (cleaned.includes('?') && cleaned.split('?')[0]!.includes(':')) {
    cleaned = cleaned.split('?')[0]!;
  }
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  return cleaned;
}

function isStaticAssetPath(url: string, clientType: ApiClientType): boolean {
  if (clientType === 'three-loader') return false;
  const clean = url.split('?')[0]!.toLowerCase();
  if (
    clean.startsWith('/i18n/') ||
    clean.startsWith('/locales/') ||
    clean.startsWith('/assets/') ||
    clean.startsWith('/public/') ||
    clean.startsWith('/static/') ||
    clean.startsWith('/images/') ||
    clean.startsWith('/icons/') ||
    clean.startsWith('/fonts/')
  ) {
    return true;
  }
  if (
    clean.endsWith('.css') ||
    clean.endsWith('.scss') ||
    clean.endsWith('.woff') ||
    clean.endsWith('.woff2') ||
    clean.endsWith('.ttf') ||
    clean.endsWith('.ico') ||
    clean.endsWith('.html')
  ) {
    return true;
  }
  return false;
}

function extractStringValue(node: ts.Node | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    return node.getText(sourceFile);
  }
  return undefined;
}

function extractUrlValue(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile,
  localConstants?: Map<string, string>
): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return normalizeUrlPath(node.text);
  }
  if (localConstants) {
    const raw = node.getText(sourceFile);
    if (localConstants.has(raw)) {
      return normalizeUrlPath(localConstants.get(raw)!);
    }
    const cleanProp = raw.replace(/^this\./, '');
    if (localConstants.has(cleanProp)) {
      return normalizeUrlPath(localConstants.get(cleanProp)!);
    }
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    if (ts.isIdentifier(node.right) && (!localConstants || !localConstants.has(node.right.getText(sourceFile)))) {
      const left = extractUrlValue(node.left, sourceFile, localConstants);
      if (left) {
        const paramName = node.right.getText(sourceFile).replace(/[^a-zA-Z0-9_]/g, '') || 'id';
        const sep = left.endsWith('=') || left.endsWith('?') || left.endsWith('&') ? '' : '/';
        return normalizeUrlPath(left.replace(/\/+$/, '') + sep + ':' + paramName);
      }
    }
    const left = extractUrlValue(node.left, sourceFile, localConstants);
    const right = extractUrlValue(node.right, sourceFile, localConstants);
    if (left && right) {
      return normalizeUrlPath(left.replace(/\/+$/, '') + '/' + right.replace(/^\/+/, ''));
    }
    if (right && (right.startsWith('/') || right.includes('api') || right.includes('v1'))) {
      return normalizeUrlPath(right);
    }
    if (left && (left.startsWith('/') || left.includes('api') || left.includes('v1'))) {
      const rightText = node.right.getText(sourceFile);
      const paramName = rightText.split('.').pop()?.replace(/[^a-zA-Z0-9_]/g, '') || 'id';
      return normalizeUrlPath(left.replace(/\/+$/, '') + '/:' + paramName);
    }
  }
  if (ts.isTemplateExpression(node)) {
    let result = '';
    const headText = node.head.text;
    const spans = node.templateSpans;
    let startIndex = 0;

    if (!headText.trim() && spans.length > 0) {
      const firstSpan = spans[0]!;
      const firstExpr = firstSpan.expression.getText(sourceFile);
      const firstExprText = firstExpr.toLowerCase();
      const literal = firstSpan.literal.text;

      const resolvedBase = localConstants?.get(firstExpr) || localConstants?.get(firstExpr.replace(/^this\./, ''));

      if (resolvedBase) {
        startIndex = 1;
        result = resolvedBase.replace(/\/+$/, '') + (literal.startsWith('/') ? literal : '/' + literal);
      } else {
        const isBaseUrlVar =
          firstExprText.includes('url') ||
          firstExprText.includes('api') ||
          firstExprText.includes('host') ||
          firstExprText.includes('proxy') ||
          firstExprText.includes('domain') ||
          firstExprText.includes('endpoint') ||
          firstExprText.includes('server') ||
          firstExprText.includes('env') ||
          firstExprText.includes('config') ||
          literal.startsWith('/') ||
          literal.startsWith('?path=') ||
          literal.startsWith('?url=');

        if (isBaseUrlVar) {
          startIndex = 1;
          const proxyQueryMatch = literal.match(/^\?(?:path|url|endpoint)=([\s\S]*)$/);
          if (proxyQueryMatch && proxyQueryMatch[1] !== undefined) {
            result = '/' + proxyQueryMatch[1].replace(/^\/+/, '');
          } else {
            result = literal.startsWith('/') ? literal : '/' + literal;
          }
        } else {
          result = headText;
        }
      }
    } else {
      result = headText;
    }

    for (let i = startIndex; i < spans.length; i++) {
      const span = spans[i]!;
      const exprText = span.expression.getText(sourceFile);
      const paramName = exprText.split('.').pop()?.replace(/[^a-zA-Z0-9_]/g, '') || 'param';
      result += `:${paramName}` + span.literal.text;
    }

    return normalizeUrlPath(result);
  }
  if (ts.isIdentifier(node)) {
    const text = node.getText(sourceFile);
    if (localConstants && localConstants.has(text)) {
      return normalizeUrlPath(localConstants.get(text)!);
    }
    return normalizeUrlPath(text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const text = node.getText(sourceFile);
    if (localConstants && localConstants.has(text)) {
      return normalizeUrlPath(localConstants.get(text)!);
    }
    const cleanProp = text.replace(/^this\./, '');
    if (localConstants && localConstants.has(cleanProp)) {
      return normalizeUrlPath(localConstants.get(cleanProp)!);
    }
    const propName = node.name.text;
    if (propName.toLowerCase().includes('url') || propName.toLowerCase().includes('endpoint') || propName.toLowerCase().includes('api')) {
      return normalizeUrlPath('/' + propName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, ''));
    }
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

  const localConstants = new Map<string, string>();

  function extractConstantValue(node: ts.Node): string | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateExpression(node)) {
      return extractUrlValue(node, sourceFile, localConstants);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return extractUrlValue(node, sourceFile, localConstants);
    }
    if (ts.isIdentifier(node)) {
      const text = node.getText(sourceFile);
      return localConstants.get(text);
    }
    if (ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sourceFile);
      return localConstants.get(text) || localConstants.get(text.replace(/^this\./, ''));
    }
    return undefined;
  }

  const importedHelperConstraints = new Map<string, Record<string, Array<string | number | boolean>>>();

  if (fileName && fileName !== 'file.ts') {
    try {
      const dir = path.dirname(fileName);
      for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
          const modPath = statement.moduleSpecifier.text;
          if (modPath.startsWith('.')) {
            const candidatePaths = [
              path.resolve(dir, modPath + '.ts'),
              path.resolve(dir, modPath + '.js'),
              path.resolve(dir, modPath, 'index.ts'),
              path.resolve(dir, modPath, 'index.js'),
            ];
            for (const p of candidatePaths) {
              if (fs.existsSync(p)) {
                try {
                  const content = fs.readFileSync(p, 'utf-8');
                  const importedSf = ts.createSourceFile(p, content, ts.ScriptTarget.Latest, false);

                  const conditionalReturnLiterals: string[] = [];
                  const paramPropAccesses = new Set<string>();
                  const exportedNames: string[] = [];

                  const scanImported = (node: ts.Node) => {
                    if (ts.isVariableDeclaration(node) && node.name && node.initializer) {
                      const name = node.name.getText(importedSf);
                      exportedNames.push(name);
                      if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
                        localConstants.set(name, node.initializer.text);
                      } else if (ts.isObjectLiteralExpression(node.initializer)) {
                        for (const prop of node.initializer.properties) {
                          if (
                            ts.isPropertyAssignment(prop) &&
                            prop.name &&
                            (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer))
                          ) {
                            const pName = prop.name.getText(importedSf).replace(/['"]/g, '');
                            localConstants.set(`${name}.${pName}`, prop.initializer.text);
                          }
                        }
                      } else if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
                        const firstParam = node.initializer.parameters[0]?.name.getText(importedSf);
                        if (firstParam) {
                          const scanFn = (fnNode: ts.Node) => {
                            if (
                              ts.isPropertyAccessExpression(fnNode) &&
                              ts.isIdentifier(fnNode.expression) &&
                              fnNode.expression.text === firstParam
                            ) {
                              paramPropAccesses.add(fnNode.name.text);
                            }
                            if (ts.isIfStatement(fnNode)) {
                              const scanReturn = (rNode: ts.Node) => {
                                if (
                                  ts.isReturnStatement(rNode) &&
                                  rNode.expression &&
                                  ts.isStringLiteral(rNode.expression)
                                ) {
                                  if (!conditionalReturnLiterals.includes(rNode.expression.text)) {
                                    conditionalReturnLiterals.push(rNode.expression.text);
                                  }
                                }
                                ts.forEachChild(rNode, scanReturn);
                              };
                              scanReturn(fnNode.thenStatement);
                            }
                            ts.forEachChild(fnNode, scanFn);
                          };
                          scanFn(node.initializer.body);
                        }
                      }
                    } else if (ts.isFunctionDeclaration(node) && node.name && node.body) {
                      exportedNames.push(node.name.text);
                      const firstParam = node.parameters[0]?.name.getText(importedSf);
                      if (firstParam) {
                        const scanFn = (fnNode: ts.Node) => {
                          if (
                            ts.isPropertyAccessExpression(fnNode) &&
                            ts.isIdentifier(fnNode.expression) &&
                            fnNode.expression.text === firstParam
                          ) {
                            paramPropAccesses.add(fnNode.name.text);
                          }
                          if (ts.isIfStatement(fnNode)) {
                            const scanReturn = (rNode: ts.Node) => {
                              if (
                                ts.isReturnStatement(rNode) &&
                                rNode.expression &&
                                ts.isStringLiteral(rNode.expression)
                              ) {
                                if (!conditionalReturnLiterals.includes(rNode.expression.text)) {
                                  conditionalReturnLiterals.push(rNode.expression.text);
                                }
                              }
                              ts.forEachChild(rNode, scanReturn);
                            };
                            scanReturn(fnNode.thenStatement);
                          }
                          ts.forEachChild(fnNode, scanFn);
                        };
                        scanFn(node.body);
                      }
                    }
                    ts.forEachChild(node, scanImported);
                  };
                  scanImported(importedSf);

                  if (conditionalReturnLiterals.length > 0 && paramPropAccesses.size > 0) {
                    const constraintRecord: Record<string, Array<string | number | boolean>> = {};
                    for (const prop of paramPropAccesses) {
                      if (prop !== 'id' && prop !== 'order' && prop !== 'isActive' && prop !== 'hasFullWidth') {
                        constraintRecord[prop] = [...conditionalReturnLiterals];
                      }
                    }
                    for (const fnName of exportedNames) {
                      importedHelperConstraints.set(fnName, constraintRecord);
                    }
                  }
                } catch {
                }
                break;
              }
            }
          }
        }
      }
    } catch {
    }
  }

  function precollectConstants(n: ts.Node): void {
    if (ts.isVariableDeclaration(n) && n.name && n.initializer) {
      const varName = n.name.getText(sourceFile);
      const val = extractConstantValue(n.initializer);
      if (val) {
        localConstants.set(varName, val);
      }
    } else if (ts.isPropertyDeclaration(n) && n.name && n.initializer) {
      const propName = n.name.getText(sourceFile);
      const val = extractConstantValue(n.initializer);
      if (val) {
        localConstants.set(propName, val);
        localConstants.set(`this.${propName}`, val);
      }
    }
    ts.forEachChild(n, precollectConstants);
  }

  precollectConstants(sourceFile);
  precollectConstants(sourceFile);

  const returnTypeStack: string[] = [];
  const enclosingScopeStack: ts.Node[] = [];

  function getEnclosingReturnType(): string | undefined {
    for (let i = returnTypeStack.length - 1; i >= 0; i--) {
      const raw = returnTypeStack[i];
      if (!raw) continue;
      const match = raw.match(/^(?:Observable|Promise|HttpResponse|Response|AxiosResponse|ApiResponse)<([\s\S]+)>$/);
      if (match && match[1]) {
        const inner = match[1].trim();
        if (inner !== 'void' && inner !== 'any' && inner !== 'unknown') {
          return inner;
        }
      } else if (!raw.includes('<') && raw !== 'void' && raw !== 'any' && raw !== 'unknown') {
        return raw.trim();
      }
    }
    return undefined;
  }

  const IGNORED_OBJECTS = new Set([
    'this',
    'err',
    'error',
    'req',
    'request',
    'event',
    'e',
    'window',
    'document',
    'localStorage',
    'sessionStorage',
    'environment',
    'state',
    'action',
    'store',
    'Math',
    'Date',
    'JSON',
    'Object',
    'Array',
    'console',
  ]);

  const IGNORED_PROPS = new Set([
    'pipe',
    'subscribe',
    'then',
    'catch',
    'finally',
    'json',
    'text',
    'blob',
    'map',
    'filter',
    'forEach',
    'reduce',
    'sort',
    'slice',
    'find',
    'some',
    'every',
    'includes',
    'length',
    'toString',
    'valueOf',
  ]);

  function extractLiteralPrimitive(node: ts.Node): string | number | boolean | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) {
      return Number(node.text);
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    return undefined;
  }

  function extractConsumerMetadata(
    hasExplicitType: boolean
  ): {
    responseConstraints?: Record<string, Array<string | number | boolean>>;
    inferredShape?: string;
  } {
    const scope = enclosingScopeStack[enclosingScopeStack.length - 1];
    if (!scope) return {};

    const constraints: Record<string, Array<string | number | boolean>> = {};
    const inferredProps = new Map<string, string>();
    const responseParams = new Set<string>();

    const addConstraint = (prop: string, val: string | number | boolean) => {
      if (IGNORED_PROPS.has(prop)) return;
      if (!constraints[prop]) {
        constraints[prop] = [];
      }
      if (!constraints[prop]!.includes(val)) {
        constraints[prop]!.push(val);
      }
    };

    const walkScope = (n: ts.Node) => {
      if (ts.isCatchClause(n)) return;
      if (ts.isCallExpression(n)) {
        const exprText = n.expression.getText(sourceFile);
        if (
          exprText === 'catchError' ||
          exprText.endsWith('.catch') ||
          exprText.endsWith('.catchError')
        ) {
          return;
        }
        if (ts.isIdentifier(n.expression) && importedHelperConstraints.has(n.expression.text)) {
          const helperMap = importedHelperConstraints.get(n.expression.text)!;
          for (const [k, vals] of Object.entries(helperMap)) {
            for (const v of vals) {
              addConstraint(k, v);
            }
          }
        }
        if (
          exprText === 'tap' ||
          exprText === 'map' ||
          exprText === 'switchMap' ||
          exprText === 'mergeMap' ||
          exprText === 'filter' ||
          exprText.endsWith('.then') ||
          exprText.endsWith('.subscribe')
        ) {
          const cb = n.arguments[0];
          if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
            const param = cb.parameters[0];
            if (param && ts.isIdentifier(param.name)) {
              responseParams.add(param.name.text);
            }
          }
        }
      }

      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isAwaitExpression(n.initializer)) {
        responseParams.add(n.name.text);
      }

      if (
        ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
      ) {
        let propAccess: ts.PropertyAccessExpression | undefined;
        let literalVal: string | number | boolean | undefined;

        if (ts.isPropertyAccessExpression(n.left)) {
          propAccess = n.left;
          literalVal = extractLiteralPrimitive(n.right);
        } else if (ts.isPropertyAccessExpression(n.right)) {
          propAccess = n.right;
          literalVal = extractLiteralPrimitive(n.left);
        }

        if (propAccess && literalVal !== undefined) {
          const rootObj = propAccess.expression.getText(sourceFile).split('.')[0]!.replace(/\?$/, '');
          if (!IGNORED_OBJECTS.has(rootObj)) {
            addConstraint(propAccess.name.text, literalVal);
          }
        }
      }

      if (ts.isSwitchStatement(n) && ts.isPropertyAccessExpression(n.expression)) {
        const rootObj = n.expression.expression.getText(sourceFile).split('.')[0]!.replace(/\?$/, '');
        const propName = n.expression.name.text;
        if (!IGNORED_OBJECTS.has(rootObj)) {
          for (const clause of n.caseBlock.clauses) {
            if (ts.isCaseClause(clause)) {
              const val = extractLiteralPrimitive(clause.expression);
              if (val !== undefined) {
                addConstraint(propName, val);
              }
            }
          }
        }
      }

      if (!hasExplicitType && ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
        const objName = n.expression.text;
        const propName = n.name.text;
        if (responseParams.has(objName) && !IGNORED_PROPS.has(propName)) {
          if (!inferredProps.has(propName)) {
            inferredProps.set(propName, 'string');
          }
        }
      }

      ts.forEachChild(n, walkScope);
    };

    walkScope(scope);

    const hasConstraints = Object.keys(constraints).length > 0;
    let inferredShape: string | undefined;
    if (!hasExplicitType && inferredProps.size > 0) {
      const fields = Array.from(inferredProps.entries())
        .map(([k, t]) => `${k}: ${t}`)
        .join('; ');
      inferredShape = `{ ${fields} }`;
    }

    return {
      ...(hasConstraints ? { responseConstraints: constraints } : {}),
      ...(inferredShape ? { inferredShape } : {}),
    };
  }

  function recordCall(
    node: ts.Node,
    method: HttpMethod,
    url: string,
    clientType: ApiClientType,
    typeArgument?: string
  ) {
    if (isStaticAssetPath(url, clientType)) {
      return;
    }

    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const effectiveType = typeArgument || getEnclosingReturnType();
    const { responseConstraints, inferredShape } = extractConsumerMetadata(Boolean(effectiveType));

    results.push({
      id: `call_${callIndex++}_${startPos.line}_${startPos.character}`,
      method,
      url,
      clientType,
      typeArgument: effectiveType || inferredShape,
      inferredShape,
      responseConstraints,
      range: {
        start: { line: startPos.line, character: startPos.character },
        end: { line: endPos.line, character: endPos.character },
      },
      rawExpression: node.getText(sourceFile),
      fileName,
    });
  }

  function visit(node: ts.Node): void {
    let pushedType = false;
    let pushedScope = false;
    if (
      ts.isMethodDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node)
    ) {
      if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
        enclosingScopeStack.push(node);
        pushedScope = true;
      } else if (enclosingScopeStack.length === 0) {
        enclosingScopeStack.push(node);
        pushedScope = true;
      }
      if (node.type) {
        returnTypeStack.push(node.type.getText(sourceFile));
        pushedType = true;
      }
    } else if (ts.isVariableDeclaration(node)) {
      if (enclosingScopeStack.length === 0) {
        enclosingScopeStack.push(node);
        pushedScope = true;
      }
      if (node.type) {
        returnTypeStack.push(node.type.getText(sourceFile));
        pushedType = true;
      }
    }

    if (ts.isCallExpression(node)) {
      const expr = node.expression;

      if (ts.isIdentifier(expr) && (expr.text === 'fetch' || expr.text === '$fetch' || expr.text === 'ofetch')) {
        const urlArg = node.arguments[0];
        const optionsArg = node.arguments[1];
        const url = extractUrlValue(urlArg, sourceFile, localConstants);
        if (url) {
          const method = extractMethodFromOptions(optionsArg, sourceFile) || 'GET';
          let typeArg: string | undefined;
          if (node.typeArguments && node.typeArguments.length > 0) {
            typeArg = node.typeArguments[0]!.getText(sourceFile);
          }
          recordCall(node, method, url, expr.text === 'fetch' ? 'fetch' : 'ofetch', typeArg);
        }
      }

      else if (ts.isIdentifier(expr) && (expr.text === 'ky' || expr.text === 'got')) {
        const urlArg = node.arguments[0];
        const optionsArg = node.arguments[1];
        const url = extractUrlValue(urlArg, sourceFile, localConstants);
        if (url) {
          const method = extractMethodFromOptions(optionsArg, sourceFile) || 'GET';
          recordCall(node, method, url, expr.text as ApiClientType);
        }
      }

      else if (ts.isPropertyAccessExpression(expr)) {
        const objText = expr.expression.getText(sourceFile);
        const lowerObj = objText.toLowerCase();
        const propName = expr.name.text.toLowerCase();
        const isHttpVerb = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'del'].includes(propName);
        const mappedVerb = (propName === 'del' ? 'DELETE' : propName.toUpperCase()) as HttpMethod;

        const isAxios = objText === 'axios' || objText.endsWith('Axios') || objText.endsWith('Client') || objText === 'api' || objText === 'service' || objText === 'request';
        const isKy = objText === 'ky' || objText.endsWith('Ky');
        const isGot = objText === 'got';
        const isSuperagent = objText === 'superagent';
        const isWretch = objText.includes('wretch');
        const isAngularHttp =
          lowerObj.includes('http') ||
          lowerObj.includes('api') ||
          lowerObj.includes('service') ||
          objText.startsWith('this._http') ||
          objText.startsWith('this.http') ||
          objText === '_http' ||
          objText === 'http';
        const isThreeLoader = (propName === 'load' && (lowerObj.includes('loader') || objText.includes('THREE')));
        const isXhrOpen = propName === 'open' && (lowerObj.includes('xhr') || objText.includes('request'));

        if ((isAxios || isKy || isGot || isSuperagent || isWretch || isAngularHttp) && isHttpVerb) {
          const urlArg = node.arguments[0];
          const url = extractUrlValue(urlArg, sourceFile, localConstants);
          if (url) {
            let typeArg: string | undefined;
            if (node.typeArguments && node.typeArguments.length > 0) {
              typeArg = node.typeArguments[0]!.getText(sourceFile);
            }
            const clientType: ApiClientType = isAngularHttp
              ? 'angular-http'
              : isKy
              ? 'ky'
              : isGot
              ? 'got'
              : isSuperagent
              ? 'superagent'
              : 'axios';
            recordCall(node, mappedVerb, url, clientType, typeArg);
          }
        } else if (isAngularHttp && propName === 'request' && node.arguments.length >= 2) {
          const methodVal = (extractStringValue(node.arguments[0], sourceFile)?.toUpperCase() || 'GET') as HttpMethod;
          const url = extractUrlValue(node.arguments[1], sourceFile, localConstants);
          if (url) {
            let typeArg: string | undefined;
            if (node.typeArguments && node.typeArguments.length > 0) {
              typeArg = node.typeArguments[0]!.getText(sourceFile);
            }
            recordCall(node, methodVal, url, 'angular-http', typeArg);
          }
        } else if (isThreeLoader) {
          const urlArg = node.arguments[0];
          const url = extractUrlValue(urlArg, sourceFile, localConstants);
          if (url) {
            recordCall(node, 'GET', url, 'three-loader');
          }
        } else if (isXhrOpen && node.arguments.length >= 2) {
          const methodVal = extractStringValue(node.arguments[0], sourceFile)?.toUpperCase() as HttpMethod;
          const urlVal = extractUrlValue(node.arguments[1], sourceFile, localConstants);
          if (urlVal && methodVal) {
            recordCall(node, methodVal, urlVal, 'xhr');
          }
        }
      }

      else if (ts.isIdentifier(expr) && (expr.text === 'useQuery' || expr.text === 'useMutation' || expr.text === 'useSWR' || expr.text === 'useSWRMutation')) {
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
                inferredUrl = extractUrlValue(firstElement, sourceFile, localConstants);
              }
            }
          }
        } else if (firstArg && ts.isArrayLiteralExpression(firstArg)) {
          const firstElement = firstArg.elements[0];
          inferredUrl = extractUrlValue(firstElement, sourceFile, localConstants);
        } else if (firstArg) {
          inferredUrl = extractUrlValue(firstArg, sourceFile, localConstants);
        }

        if (inferredUrl) {
          const isMutation = expr.text.toLowerCase().includes('mutation');
          const clientType = expr.text.startsWith('useSWR') ? 'swr' : 'useQuery';
          recordCall(node, isMutation ? 'POST' : 'GET', inferredUrl, clientType, typeArg);
        }
      }

      else if (ts.isIdentifier(expr) && (expr.text === 'httpResource' || expr.text === 'rxResource')) {
        const urlArg = node.arguments[0];
        const url = extractUrlValue(urlArg, sourceFile, localConstants);
        if (url) {
          let typeArg: string | undefined;
          if (node.typeArguments && node.typeArguments.length > 0) {
            typeArg = node.typeArguments[0]!.getText(sourceFile);
          }
          recordCall(node, 'GET', url, 'angular-http', typeArg);
        }
      }
    }

    ts.forEachChild(node, visit);
    if (pushedType) {
      returnTypeStack.pop();
    }
    if (pushedScope) {
      enclosingScopeStack.pop();
    }
  }

  visit(sourceFile);
  return results;
}
