import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GeneratedMock } from '../../../shared/kernel/index';
import { synthesizeStringValue, synthesizeNumberValue, synthesizeBooleanValue } from '../domain/heuristics';

const WRAPPER_PATTERNS = [
  /^Promise<([\s\S]+)>$/,
  /^AxiosResponse<([\s\S]+)>$/,
  /^ApiResponse<([\s\S]+)>$/,
  /^Observable<([\s\S]+)>$/,
  /^Response<([\s\S]+)>$/,
];

export function unwrapTypeWrappers(typeName: string): string {
  let current = typeName.trim();
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of WRAPPER_PATTERNS) {
      const match = current.match(pattern);
      if (match && match[1]) {
        current = match[1].trim();
        changed = true;
        break;
      }
    }
  }

  return current;
}

export interface SynthesisOptions {
  depth?: number;
  maxDepth?: number;
  visitedCounts?: Map<string, number>;
}

export class TypeSynthesizerEngine {
  private readonly typeDeclarations: Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration> = new Map();
  private readonly importPaths: Map<string, { specifier: string; sourceFilePath?: string }> = new Map();
  private readonly visitedFiles: Set<string> = new Set();
  private readonly currentFilePath?: string;

  constructor(sourceCode?: string, currentFilePath?: string) {
    this.currentFilePath = currentFilePath;
    if (sourceCode) {
      this.indexDeclarations(sourceCode, currentFilePath);
    }
  }

  public indexDeclarations(sourceCode: string, filePath?: string): void {
    if (filePath) {
      this.visitedFiles.add(path.normalize(filePath));
    }

    const sourceFile = ts.createSourceFile('types.ts', sourceCode, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node)) {
        this.typeDeclarations.set(node.name.text, node);
      } else if (ts.isTypeAliasDeclaration(node)) {
        this.typeDeclarations.set(node.name.text, node);
      } else if (ts.isEnumDeclaration(node)) {
        this.typeDeclarations.set(node.name.text, node);
      } else if (ts.isImportDeclaration(node)) {
        const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
        if (specifier && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            this.importPaths.set(el.name.text, { specifier, sourceFilePath: filePath });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private resolveImportedDeclaration(typeName: string): void {
    const importInfo = this.importPaths.get(typeName);
    const sourceFilePath = importInfo?.sourceFilePath || this.currentFilePath;
    if (!importInfo || !sourceFilePath) return;

    const specifier = importInfo.specifier;
    if (!specifier.startsWith('.')) return; // Only traverse relative workspace imports

    try {
      const baseDir = path.dirname(sourceFilePath);
      const targetBase = path.resolve(baseDir, specifier);
      const candidates = [
        targetBase + '.ts',
        targetBase + '.tsx',
        targetBase + '.d.ts',
        path.join(targetBase, 'index.ts'),
        path.join(targetBase, 'index.d.ts'),
        targetBase,
      ];

      for (const candidate of candidates) {
        const normalized = path.normalize(candidate);
        if (this.visitedFiles.has(normalized)) continue;

        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const content = fs.readFileSync(candidate, 'utf8');
          this.indexDeclarations(content, candidate);
          break;
        }
      }
    } catch {
    }
  }

  public synthesize(
    typeName: string,
    options: SynthesisOptions = { depth: 0, maxDepth: 4, visitedCounts: new Map() }
  ): unknown {
    const cleanType = unwrapTypeWrappers(typeName);
    const trimmed = cleanType.trim();
    const depth = options.depth ?? 0;
    const maxDepth = options.maxDepth ?? 4;
    const visitedCounts = new Map(options.visitedCounts ?? []);

    if (depth >= maxDepth) {
      return {};
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const tempSource = `type __TempInlineType = ${trimmed};`;
      const tempFile = ts.createSourceFile('inline.ts', tempSource, ts.ScriptTarget.Latest, true);
      for (const statement of tempFile.statements) {
        if (ts.isTypeAliasDeclaration(statement) && statement.type) {
          return this.synthesizeTypeNode(statement.type, { depth, maxDepth, visitedCounts }, 'root');
        }
      }
    }

    if (cleanType.endsWith('[]')) {
      const inner = cleanType.slice(0, -2);
      if (depth + 1 >= maxDepth) return [];
      return [this.synthesize(inner, { depth: depth + 1, maxDepth, visitedCounts })];
    }
    const arrayMatch = cleanType.match(/^Array<([\s\S]+)>$/);
    if (arrayMatch && arrayMatch[1]) {
      if (depth + 1 >= maxDepth) return [];
      return [this.synthesize(arrayMatch[1], { depth: depth + 1, maxDepth, visitedCounts })];
    }

    const lower = cleanType.toLowerCase();
    if (lower === 'string') return synthesizeStringValue('sample');
    if (lower === 'number') return synthesizeNumberValue('amount');
    if (lower === 'boolean') return synthesizeBooleanValue('flag');
    if (lower === 'void' || lower === 'undefined' || lower === 'null') return null;
    if (lower === 'any' || lower === 'unknown') return { sampleKey: 'sampleValue' };

    const count = visitedCounts.get(cleanType) || 0;
    if (count >= 2) {
      return {};
    }

    if (!this.typeDeclarations.has(cleanType)) {
      this.resolveImportedDeclaration(cleanType);
    }

    const decl = this.typeDeclarations.get(cleanType);
    if (!decl) {
      return {
        id: synthesizeStringValue('id'),
        name: synthesizeStringValue(cleanType),
        status: 'active',
        createdAt: '2026-10-18T12:00:00Z',
      };
    }

    visitedCounts.set(cleanType, count + 1);

    if (ts.isInterfaceDeclaration(decl)) {
      return this.synthesizeInterface(decl, { depth: depth + 1, maxDepth, visitedCounts });
    }

    if (ts.isTypeAliasDeclaration(decl)) {
      return this.synthesizeTypeNode(decl.type, { depth: depth + 1, maxDepth, visitedCounts }, decl.name.text);
    }

    if (ts.isEnumDeclaration(decl)) {
      const firstMember = decl.members[0];
      if (firstMember) {
        if (firstMember.initializer && ts.isStringLiteral(firstMember.initializer)) {
          return firstMember.initializer.text;
        }
        if (firstMember.initializer && ts.isNumericLiteral(firstMember.initializer)) {
          return Number(firstMember.initializer.text);
        }
        return firstMember.name.getText();
      }
      return 0;
    }

    return {};
  }

  private synthesizeInterface(decl: ts.InterfaceDeclaration, options: SynthesisOptions): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (decl.heritageClauses) {
      for (const clause of decl.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeRef of clause.types) {
            const inheritedName = typeRef.expression.getText();
            const inherited = this.synthesize(inheritedName, options);
            if (inherited && typeof inherited === 'object' && !Array.isArray(inherited)) {
              Object.assign(result, inherited);
            }
          }
        }
      }
    }

    for (const member of decl.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const fieldName = member.name.getText();
        if (member.type) {
          result[fieldName] = this.synthesizeTypeNode(member.type, options, fieldName);
        } else {
          result[fieldName] = synthesizeStringValue(fieldName);
        }
      }
    }

    return result;
  }

  private synthesizeTypeNode(typeNode: ts.TypeNode, options: SynthesisOptions, fieldName: string): unknown {
    if (ts.isTypeReferenceNode(typeNode)) {
      const refName = typeNode.typeName.getText();
      return this.synthesize(refName, options);
    }

    if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
      return synthesizeStringValue(fieldName);
    }

    if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
      return synthesizeNumberValue(fieldName);
    }

    if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
      return synthesizeBooleanValue(fieldName);
    }

    if (ts.isArrayTypeNode(typeNode)) {
      return [this.synthesizeTypeNode(typeNode.elementType, options, fieldName)];
    }

    if (ts.isTypeLiteralNode(typeNode)) {
      const obj: Record<string, unknown> = {};
      for (const m of typeNode.members) {
        if (ts.isPropertySignature(m) && m.name && m.type) {
          obj[m.name.getText()] = this.synthesizeTypeNode(m.type, options, m.name.getText());
        }
      }
      return obj;
    }

    if (ts.isIntersectionTypeNode(typeNode)) {
      const merged: Record<string, unknown> = {};
      for (const subType of typeNode.types) {
        const val = this.synthesizeTypeNode(subType, options, fieldName);
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(merged, val);
        }
      }
      return merged;
    }

    if (ts.isUnionTypeNode(typeNode)) {
      const firstType = typeNode.types[0];
      if (firstType) {
        return this.synthesizeTypeNode(firstType, options, fieldName);
      }
    }

    if (ts.isLiteralTypeNode(typeNode)) {
      if (ts.isStringLiteral(typeNode.literal)) {
        return typeNode.literal.text;
      }
      if (ts.isNumericLiteral(typeNode.literal)) {
        return Number(typeNode.literal.text);
      }
      if (typeNode.literal.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (typeNode.literal.kind === ts.SyntaxKind.FalseKeyword) return false;
    }

    return synthesizeStringValue(fieldName);
  }
}

export function synthesizePayload(
  typeName: string,
  _typeChecker?: ts.TypeChecker | null,
  sourceCode?: string,
  filePath?: string
): GeneratedMock {
  const engine = new TypeSynthesizerEngine(sourceCode, filePath);
  const cleanType = unwrapTypeWrappers(typeName);
  const body = engine.synthesize(cleanType);

  return {
    statusCode: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body,
    rawBody: JSON.stringify(body, null, 2),
    schemaDescription: `Synthesized from generic <${cleanType}>`,
  };
}

export function generateMockVariants(
  typeName?: string,
  typeChecker?: ts.TypeChecker | null,
  sourceCode?: string,
  filePath?: string
): Record<'ok200' | 'bad400' | 'server500' | 'empty204', GeneratedMock> {
  const ok200 = typeName
    ? synthesizePayload(typeName, typeChecker, sourceCode, filePath)
    : {
        statusCode: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
        body: { status: 'success', message: 'Mock response' },
        rawBody: JSON.stringify({ status: 'success', message: 'Mock response' }, null, 2),
        schemaDescription: 'Default 200 Mock',
      };

  const bad400: GeneratedMock = {
    statusCode: 400,
    statusText: 'Bad Request',
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'Bad Request',
      message: 'Invalid payload parameters or missing required fields',
      code: 'ERR_INVALID_INPUT',
    },
    rawBody: JSON.stringify(
      {
        error: 'Bad Request',
        message: 'Invalid payload parameters or missing required fields',
        code: 'ERR_INVALID_INPUT',
      },
      null,
      2
    ),
    schemaDescription: 'Standard 400 Bad Request Error',
  };

  const server500: GeneratedMock = {
    statusCode: 500,
    statusText: 'Internal Server Error',
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'Internal Server Error',
      message: 'An unexpected exception occurred on the upstream server',
      traceId: 'tr_8f9104c9-b7b5-4bfe',
    },
    rawBody: JSON.stringify(
      {
        error: 'Internal Server Error',
        message: 'An unexpected exception occurred on the upstream server',
        traceId: 'tr_8f9104c9-b7b5-4bfe',
      },
      null,
      2
    ),
    schemaDescription: 'Standard 500 Internal Server Error',
  };

  const empty204: GeneratedMock = {
    statusCode: 204,
    statusText: 'No Content',
    headers: {},
    body: null,
    rawBody: '',
    schemaDescription: '204 No Content',
  };

  return { ok200, bad400, server500, empty204 };
}
