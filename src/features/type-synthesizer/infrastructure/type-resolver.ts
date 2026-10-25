import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { GeneratedMock } from '../../../shared/kernel/index';
import { synthesizeStringValue, synthesizeNumberValue, synthesizeBooleanValue } from '../domain/heuristics';
import { generateAuthScenarios, isAuthEndpoint, is2faEndpoint } from '../domain/auth-mock';

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
  depth?: number | undefined;
  maxDepth?: number | undefined;
  visitedCounts?: Map<string, number> | undefined;
  itemIndex?: number | undefined;
  typeParameterMap?: Map<string, string> | undefined;
  responseConstraints?: Record<string, Array<string | number | boolean>> | undefined;
  enclosingTypeName?: string | undefined;
}

const OPTIONAL_ERROR_FIELDS = new Set([
  'error',
  'errormessage',
  'error_message',
  'errorcode',
  'error_code',
  'declinereason',
  'decline_reason',
  'createerror',
]);

const BUILTIN_TYPE_KEYWORDS = new Set([
  'string',
  'number',
  'boolean',
  'any',
  'unknown',
  'void',
  'null',
  'undefined',
  'object',
  'never',
  'bigint',
  'symbol',
  'Date',
  'Record',
  'Map',
  'Set',
  'Array',
  'Partial',
  'Required',
  'Readonly',
  'Pick',
  'Omit',
  'NonNullable',
  'Promise',
  'Observable',
]);

const SIMPLE_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type TypeDeclaration =
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration
  | ts.ClassDeclaration;

const globalDeclarationCache = new Map<string, TypeDeclaration>();
const globalNegativeLookupCache = new Set<string>();
const globalTsConfigCache = new Map<string, { rootDir: string; paths: Record<string, string[]> } | null>();

function enforceObjectCoherence(obj: Record<string, unknown>, itemIndex: number): Record<string, unknown> {
  const currency = obj['currency'] || obj['code'];
  if (typeof currency === 'string' && ('symbol' in obj || 'currencySymbol' in obj)) {
    const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GEL' ? '₾' : '$';
    if ('symbol' in obj) obj['symbol'] = sym;
    if ('currencySymbol' in obj) obj['currencySymbol'] = sym;
  }

  if (typeof obj['status'] === 'number' && typeof obj['statusName'] === 'string') {
    const statusMap: Record<number, string> = { 1: 'Pending', 2: 'Approved', 3: 'Declined' };
    if (statusMap[obj['status']]) {
      obj['statusName'] = statusMap[obj['status']]!;
    }
  }

  if (typeof obj['cardId'] === 'string' && obj['details'] && typeof obj['details'] === 'object' && !Array.isArray(obj['details'])) {
    const detailsObj = obj['details'] as Record<string, unknown>;
    if ('id' in detailsObj) {
      detailsObj['id'] = obj['cardId'];
    }
  }

  if (typeof obj['minAmount'] === 'number' && typeof obj['maxAmount'] === 'number' && obj['minAmount'] >= obj['maxAmount']) {
    obj['minAmount'] = 10;
    obj['maxAmount'] = 15000;
  }

  if ('serviceName' in obj && 'isFinal' in obj) {
    obj['isFinal'] = true;
    if ('children' in obj && Array.isArray(obj['children'])) {
      obj['children'] = [];
    }
  }

  if (typeof obj['id'] === 'string' && obj['id'].startsWith('id_')) {
    obj['id'] = `id_${1001 + (itemIndex % 3)}`;
  }

  return obj;
}

function splitTopLevelTypeArgs(argsText: string): string[] {
  const result: string[] = [];
  let current = '';
  let angleDepth = 0;
  let braceDepth = 0;
  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i]!;
    if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (ch === ',' && angleDepth === 0 && braceDepth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

export class TypeSynthesizerEngine {
  private readonly typeDeclarations: Map<
    string,
    ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | ts.ClassDeclaration
  > = new Map();
  private readonly importPaths: Map<
    string,
    { specifier: string; sourceFilePath?: string | undefined; originalName?: string | undefined }
  > = new Map();
  private readonly barrelExports: Array<{ specifier: string; sourceFilePath: string }> = [];
  private readonly visitedFiles: Set<string> = new Set();
  private readonly currentFilePath?: string | undefined;

  constructor(sourceCode?: string | undefined, currentFilePath?: string | undefined) {
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
        if (filePath) globalDeclarationCache.set(node.name.text, node);
      } else if (ts.isTypeAliasDeclaration(node)) {
        this.typeDeclarations.set(node.name.text, node);
        if (filePath) globalDeclarationCache.set(node.name.text, node);
      } else if (ts.isEnumDeclaration(node)) {
        this.typeDeclarations.set(node.name.text, node);
        if (filePath) globalDeclarationCache.set(node.name.text, node);
      } else if (ts.isClassDeclaration(node) && node.name) {
        this.typeDeclarations.set(node.name.text, node);
        if (filePath) globalDeclarationCache.set(node.name.text, node);
      } else if (ts.isImportDeclaration(node)) {
        const specifier = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
        if (specifier && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const el of node.importClause.namedBindings.elements) {
            this.importPaths.set(el.name.text, {
              specifier,
              sourceFilePath: filePath,
              originalName: el.propertyName?.text,
            });
          }
        }
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (!node.exportClause && filePath) {
          this.barrelExports.push({ specifier, sourceFilePath: filePath });
        } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            this.importPaths.set(el.name.text, {
              specifier,
              sourceFilePath: filePath,
              originalName: el.propertyName?.text,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private findTsConfigPaths(sourceFilePath?: string): { rootDir: string; paths: Record<string, string[]> } | undefined {
    if (!sourceFilePath) return undefined;
    const startDir = path.dirname(sourceFilePath);
    if (globalTsConfigCache.has(startDir)) {
      return globalTsConfigCache.get(startDir) ?? undefined;
    }
    let currDir = startDir;
    for (let i = 0; i < 8; i++) {
      const baseTsConfig = path.join(currDir, 'tsconfig.base.json');
      const normalTsConfig = path.join(currDir, 'tsconfig.json');
      const candidates = [baseTsConfig, normalTsConfig].filter((c) => fs.existsSync(c));
      for (const targetTsConfig of candidates) {
        try {
          const raw = fs.readFileSync(targetTsConfig, 'utf8');
          const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
          const parsed = JSON.parse(cleaned);
          const paths = parsed.compilerOptions?.paths;
          if (paths && typeof paths === 'object' && Object.keys(paths).length > 0) {
            const res = { rootDir: currDir, paths };
            globalTsConfigCache.set(startDir, res);
            return res;
          }
          if (typeof parsed.extends === 'string' && parsed.extends.startsWith('.')) {
            const extendedPath = path.resolve(path.dirname(targetTsConfig), parsed.extends);
            const extFile = fs.existsSync(extendedPath)
              ? extendedPath
              : fs.existsSync(extendedPath + '.json')
                ? extendedPath + '.json'
                : null;
            if (extFile) {
              const extRaw = fs.readFileSync(extFile, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
              const extParsed = JSON.parse(extRaw);
              if (extParsed.compilerOptions?.paths) {
                const res = { rootDir: path.dirname(extFile), paths: extParsed.compilerOptions.paths };
                globalTsConfigCache.set(startDir, res);
                return res;
              }
            }
          }
        } catch {}
      }
      const parent = path.dirname(currDir);
      if (parent === currDir) break;
      currDir = parent;
    }
    globalTsConfigCache.set(startDir, null);
    return undefined;
  }

  private searchWorkspaceForDeclaration(typeName: string, sourceFilePath: string): void {
    if (
      this.typeDeclarations.has(typeName) ||
      BUILTIN_TYPE_KEYWORDS.has(typeName) ||
      !SIMPLE_IDENTIFIER_REGEX.test(typeName)
    ) {
      return;
    }
    if (globalDeclarationCache.has(typeName)) {
      this.typeDeclarations.set(typeName, globalDeclarationCache.get(typeName)!);
      return;
    }
    if (globalNegativeLookupCache.has(typeName)) {
      return;
    }
    try {
      let curr = path.dirname(sourceFilePath);
      let wsRoot: string | null = null;
      for (let i = 0; i < 8; i++) {
        if (
          fs.existsSync(path.join(curr, 'nx.json')) ||
          fs.existsSync(path.join(curr, 'angular.json')) ||
          fs.existsSync(path.join(curr, 'package.json'))
        ) {
          wsRoot = curr;
          break;
        }
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }
      if (!wsRoot) return;

      const targetDirs = [path.join(wsRoot, 'libs'), path.join(wsRoot, 'apps'), path.join(wsRoot, 'src')];
      const declRegex = new RegExp(`export\\s+(?:interface|type|enum|class)\\s+${typeName}\\b`);

      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const scan = (d: string, depth = 4) => {
          if (depth <= 0 || this.typeDeclarations.has(typeName)) return;
          const entries = fs.readdirSync(d, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) {
              scan(full, depth - 1);
            } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts'))) {
              const normalized = path.normalize(full);
              if (this.visitedFiles.has(normalized)) continue;
              const stat = fs.statSync(full);
              if (stat.size > 256 * 1024) continue;
              const text = fs.readFileSync(full, 'utf8');
              if (declRegex.test(text)) {
                this.indexDeclarations(text, full);
                if (this.typeDeclarations.has(typeName)) return;
              }
            }
          }
        };
        scan(dir);
        if (this.typeDeclarations.has(typeName)) break;
      }
      if (!this.typeDeclarations.has(typeName)) {
        globalNegativeLookupCache.add(typeName);
      }
    } catch {}
  }

  private tryResolveFileSpecifier(specifier: string, sourceFilePath: string): void {
    if (specifier.startsWith('.')) {
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
            return;
          }
        }
      } catch {}
    } else {
      const tsconfigInfo = this.findTsConfigPaths(sourceFilePath);
      if (tsconfigInfo) {
        for (const [aliasPattern, targetList] of Object.entries(tsconfigInfo.paths)) {
          let matched = false;
          let subPath = '';
          if (aliasPattern.endsWith('/*') && specifier.startsWith(aliasPattern.slice(0, -2))) {
            matched = true;
            subPath = specifier.slice(aliasPattern.slice(0, -2).length);
          } else if (aliasPattern === specifier) {
            matched = true;
          }

          if (matched && Array.isArray(targetList)) {
            for (const targetRel of targetList) {
              const targetReplaced = subPath ? targetRel.replace(/\*$/, subPath) : targetRel;
              const fullTarget = path.resolve(tsconfigInfo.rootDir, targetReplaced);
              const candidates = [
                fullTarget,
                fullTarget + '.ts',
                fullTarget + '.d.ts',
                path.join(fullTarget, 'index.ts'),
                path.join(fullTarget, 'index.d.ts'),
              ];
              for (const candidate of candidates) {
                const normalized = path.normalize(candidate);
                if (this.visitedFiles.has(normalized)) continue;
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                  const content = fs.readFileSync(candidate, 'utf8');
                  this.indexDeclarations(content, candidate);
                  return;
                }
              }
            }
          }
        }
      }
    }
  }

  private resolveImportedDeclaration(typeName: string): void {
    if (
      BUILTIN_TYPE_KEYWORDS.has(typeName) ||
      !SIMPLE_IDENTIFIER_REGEX.test(typeName)
    ) {
      return;
    }
    const importInfo = this.importPaths.get(typeName);
    const sourceFilePath = importInfo?.sourceFilePath || this.currentFilePath;
    if (!sourceFilePath) return;

    const lookupName = importInfo?.originalName || typeName;
    if (globalDeclarationCache.has(lookupName)) {
      this.typeDeclarations.set(typeName, globalDeclarationCache.get(lookupName)!);
      return;
    }

    if (importInfo) {
      this.tryResolveFileSpecifier(importInfo.specifier, sourceFilePath);
      if (lookupName !== typeName && this.typeDeclarations.has(lookupName)) {
        this.typeDeclarations.set(typeName, this.typeDeclarations.get(lookupName)!);
        return;
      }
      if (this.typeDeclarations.has(typeName)) return;
    }

    let barrelIndex = 0;
    while (barrelIndex < this.barrelExports.length && barrelIndex < 40) {
      const barrel = this.barrelExports[barrelIndex++]!;
      this.tryResolveFileSpecifier(barrel.specifier, barrel.sourceFilePath);
      if (lookupName !== typeName && this.typeDeclarations.has(lookupName)) {
        this.typeDeclarations.set(typeName, this.typeDeclarations.get(lookupName)!);
        return;
      }
      if (this.typeDeclarations.has(typeName)) return;
    }

    this.searchWorkspaceForDeclaration(lookupName, sourceFilePath);
    if (lookupName !== typeName && this.typeDeclarations.has(lookupName)) {
      this.typeDeclarations.set(typeName, this.typeDeclarations.get(lookupName)!);
    }
  }

  private getCollectionItemCount(innerType: string, options: SynthesisOptions): number {
    if (options.responseConstraints) {
      let maxConstraintLen = 0;
      for (const vals of Object.values(options.responseConstraints)) {
        if (vals.length > maxConstraintLen) {
          maxConstraintLen = vals.length;
        }
      }
      if (maxConstraintLen > 1) {
        return Math.min(maxConstraintLen, 5);
      }
    }

    const mappedInner = options.typeParameterMap?.get(innerType.trim()) ?? innerType.trim();
    if (!this.typeDeclarations.has(mappedInner)) {
      this.resolveImportedDeclaration(mappedInner);
    }
    const decl = this.typeDeclarations.get(mappedInner);
    if (decl && (ts.isInterfaceDeclaration(decl) || ts.isClassDeclaration(decl))) {
      for (const member of decl.members) {
        if ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && member.name) {
          const propName = member.name.getText().toLowerCase();
          if (
            propName.includes('currency') ||
            propName.includes('iban') ||
            propName.includes('rate') ||
            propName.includes('widget') ||
            propName.includes('transactiontype') ||
            propName.includes('category') ||
            propName.includes('purpose') ||
            propName.includes('prepayment') ||
            propName.includes('service') ||
            propName.includes('month') ||
            propName.includes('day') ||
            propName.includes('income') ||
            propName.includes('expense') ||
            propName.includes('saving') ||
            propName.includes('card') ||
            propName.includes('loan')
          ) {
            return 3;
          }
          if (member.type) {
            if (ts.isUnionTypeNode(member.type)) {
              return 3;
            }
            if (ts.isTypeReferenceNode(member.type)) {
              const refName = member.type.typeName.getText();
              if (!this.typeDeclarations.has(refName)) {
                this.resolveImportedDeclaration(refName);
              }
              const refDecl = this.typeDeclarations.get(refName);
              if (refDecl && (ts.isEnumDeclaration(refDecl) || ts.isTypeAliasDeclaration(refDecl))) {
                return 3;
              }
            }
          }
        }
      }
    }
    return 1;
  }

  private extractLiteralKeysFromTypeText(keyTypeText: string): string[] {
    const keys: string[] = [];
    const trimmed = keyTypeText.trim();
    if (this.typeDeclarations.has(trimmed)) {
      const decl = this.typeDeclarations.get(trimmed)!;
      if (ts.isEnumDeclaration(decl)) {
        for (const m of decl.members) {
          if (m.initializer && ts.isStringLiteral(m.initializer)) {
            keys.push(m.initializer.text);
          } else {
            keys.push(m.name.getText());
          }
        }
        return keys;
      }
      if (ts.isTypeAliasDeclaration(decl) && ts.isUnionTypeNode(decl.type)) {
        for (const sub of decl.type.types) {
          if (ts.isLiteralTypeNode(sub) && ts.isStringLiteral(sub.literal)) {
            keys.push(sub.literal.text);
          }
        }
        return keys;
      }
    }
    const regex = /['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(trimmed)) !== null) {
      if (m[1]) keys.push(m[1]);
    }
    return keys;
  }

  public synthesize(
    typeName: string,
    options: SynthesisOptions = { depth: 0, maxDepth: 4, visitedCounts: new Map() }
  ): unknown {
    let cleanType = unwrapTypeWrappers(typeName);
    let trimmed = cleanType.trim();

    if (options.typeParameterMap?.has(trimmed)) {
      cleanType = unwrapTypeWrappers(options.typeParameterMap.get(trimmed)!);
      trimmed = cleanType.trim();
    }

    const depth = options.depth ?? 0;
    const maxDepth = options.maxDepth ?? 4;
    const visitedCounts = new Map(options.visitedCounts ?? []);
    const itemIndex = options.itemIndex ?? 0;
    const typeParameterMap = options.typeParameterMap;
    const responseConstraints = options.responseConstraints;
    const enclosingTypeName = options.enclosingTypeName;

    if (depth >= maxDepth) {
      return {};
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const tempSource = `type __TempInlineType = ${trimmed};`;
      const tempFile = ts.createSourceFile('inline.ts', tempSource, ts.ScriptTarget.Latest, true);
      for (const statement of tempFile.statements) {
        if (ts.isTypeAliasDeclaration(statement) && statement.type) {
          return this.synthesizeTypeNode(
            statement.type,
            {
              depth,
              maxDepth,
              visitedCounts,
              itemIndex,
              ...(typeParameterMap ? { typeParameterMap } : {}),
              ...(responseConstraints ? { responseConstraints } : {}),
              ...(enclosingTypeName ? { enclosingTypeName } : {}),
            },
            'root'
          );
        }
      }
    }

    const genericAngleIdx = trimmed.indexOf('<');
    if (genericAngleIdx > 0 && trimmed.endsWith('>')) {
      const baseTypeName = trimmed.slice(0, genericAngleIdx).trim();
      const argsContent = trimmed.slice(genericAngleIdx + 1, -1).trim();
      const typeArgs = splitTopLevelTypeArgs(argsContent);

      if (
        (baseTypeName === 'Partial' ||
          baseTypeName === 'Required' ||
          baseTypeName === 'Readonly' ||
          baseTypeName === 'NonNullable') &&
        typeArgs[0]
      ) {
        return this.synthesize(typeArgs[0], options);
      }

      if ((baseTypeName === 'Pick' || baseTypeName === 'Omit') && typeArgs[0] && typeArgs[1]) {
        const baseSynthesized = this.synthesize(typeArgs[0], options);
        if (baseSynthesized && typeof baseSynthesized === 'object' && !Array.isArray(baseSynthesized)) {
          const keys = new Set(this.extractLiteralKeysFromTypeText(typeArgs[1]));
          if (keys.size > 0) {
            const filtered: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(baseSynthesized as Record<string, unknown>)) {
              if (baseTypeName === 'Pick' && keys.has(k)) {
                filtered[k] = v;
              } else if (baseTypeName === 'Omit' && !keys.has(k)) {
                filtered[k] = v;
              }
            }
            return filtered;
          }
        }
        return baseSynthesized;
      }

      if ((baseTypeName === 'Record' || baseTypeName === 'Map') && typeArgs[0] && typeArgs[1]) {
        const keyType = typeParameterMap?.get(typeArgs[0]) ?? typeArgs[0];
        const valType = typeParameterMap?.get(typeArgs[1]) ?? typeArgs[1];
        if (!this.typeDeclarations.has(keyType)) {
          this.resolveImportedDeclaration(keyType);
        }
        const literalKeys = this.extractLiteralKeysFromTypeText(keyType);
        if (literalKeys.length > 0) {
          const rec: Record<string, unknown> = {};
          literalKeys.forEach((k, idx) => {
            rec[k] = this.synthesize(valType, {
              ...options,
              depth: depth + 1,
              itemIndex: idx,
            });
          });
          return rec;
        }
        return {};
      }
    }

    if (cleanType.endsWith('[]')) {
      const inner = cleanType.slice(0, -2).trim();
      if (depth + 1 >= maxDepth) return [];
      if (inner.toLowerCase() === 'number' && enclosingTypeName?.toLowerCase().includes('month')) {
        return [6, 12, 24, 36, 48, 60];
      }
      const count = this.getCollectionItemCount(inner, options);
      return Array.from({ length: count }, (_, idx) =>
        this.synthesize(inner, {
          depth: depth + 1,
          maxDepth,
          visitedCounts: new Map(visitedCounts),
          itemIndex: idx,
          ...(typeParameterMap ? { typeParameterMap } : {}),
          ...(responseConstraints ? { responseConstraints } : {}),
          ...(enclosingTypeName ? { enclosingTypeName } : {}),
        })
      );
    }
    const arrayMatch = cleanType.match(/^Array<([\s\S]+)>$/);
    if (arrayMatch && arrayMatch[1]) {
      if (depth + 1 >= maxDepth) return [];
      const inner = arrayMatch[1];
      const count = this.getCollectionItemCount(inner, options);
      return Array.from({ length: count }, (_, idx) =>
        this.synthesize(inner, {
          depth: depth + 1,
          maxDepth,
          visitedCounts: new Map(visitedCounts),
          itemIndex: idx,
          ...(typeParameterMap ? { typeParameterMap } : {}),
          ...(responseConstraints ? { responseConstraints } : {}),
          ...(enclosingTypeName ? { enclosingTypeName } : {}),
        })
      );
    }

    if (genericAngleIdx > 0 && trimmed.endsWith('>')) {
      const baseTypeName = trimmed.slice(0, genericAngleIdx).trim();
      const argsContent = trimmed.slice(genericAngleIdx + 1, -1).trim();
      const typeArgs = splitTopLevelTypeArgs(argsContent);

      if (!this.typeDeclarations.has(baseTypeName)) {
        this.resolveImportedDeclaration(baseTypeName);
      }
      const genericDecl = this.typeDeclarations.get(baseTypeName);
      if (
        genericDecl &&
        (ts.isInterfaceDeclaration(genericDecl) ||
          ts.isTypeAliasDeclaration(genericDecl) ||
          ts.isClassDeclaration(genericDecl)) &&
        genericDecl.typeParameters &&
        genericDecl.typeParameters.length > 0
      ) {
        const nextTypeParamMap = new Map<string, string>(typeParameterMap ?? []);
        genericDecl.typeParameters.forEach((param, idx) => {
          const argText = typeArgs[idx] ?? (param.default ? param.default.getText() : 'any');
          const resolvedArg = typeParameterMap?.get(argText) ?? argText;
          nextTypeParamMap.set(param.name.text, resolvedArg);
        });

        visitedCounts.set(trimmed, (visitedCounts.get(trimmed) || 0) + 1);
        const nextOptions: SynthesisOptions = {
          depth: depth + 1,
          maxDepth,
          visitedCounts,
          itemIndex,
          typeParameterMap: nextTypeParamMap,
          ...(responseConstraints ? { responseConstraints } : {}),
          enclosingTypeName: genericDecl.name?.text ?? baseTypeName,
        };
        if (ts.isInterfaceDeclaration(genericDecl) || ts.isClassDeclaration(genericDecl)) {
          return this.synthesizeInterfaceOrClass(genericDecl, nextOptions);
        }
        return this.synthesizeTypeNode(genericDecl.type, nextOptions, genericDecl.name.text);
      }
    }

    const lower = cleanType.toLowerCase();
    if (lower === 'string') return synthesizeStringValue('sample', itemIndex, enclosingTypeName);
    if (lower === 'number') return synthesizeNumberValue('amount', itemIndex, enclosingTypeName);
    if (lower === 'boolean') return synthesizeBooleanValue('flag', itemIndex);
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
        id: synthesizeStringValue('id', itemIndex, cleanType),
        name: synthesizeStringValue(cleanType, itemIndex, cleanType),
        status: responseConstraints?.['status']?.[0] ?? 'active',
        createdAt: '2026-10-18T12:00:00Z',
      };
    }

    visitedCounts.set(cleanType, count + 1);
    const nextOptions: SynthesisOptions = {
      depth: depth + 1,
      maxDepth,
      visitedCounts,
      itemIndex,
      ...(typeParameterMap ? { typeParameterMap } : {}),
      ...(responseConstraints ? { responseConstraints } : {}),
      enclosingTypeName: decl.name?.text ?? cleanType,
    };

    if (ts.isInterfaceDeclaration(decl) || ts.isClassDeclaration(decl)) {
      return this.synthesizeInterfaceOrClass(decl, nextOptions);
    }

    if (ts.isTypeAliasDeclaration(decl)) {
      return this.synthesizeTypeNode(decl.type, nextOptions, decl.name.text);
    }

    if (ts.isEnumDeclaration(decl)) {
      const member = decl.members[itemIndex % Math.max(decl.members.length, 1)] ?? decl.members[0];
      if (member) {
        if (member.initializer && ts.isStringLiteral(member.initializer)) {
          return member.initializer.text;
        }
        if (member.initializer && ts.isNumericLiteral(member.initializer)) {
          return Number(member.initializer.text);
        }
        return member.name.getText();
      }
      return 0;
    }

    return {};
  }

  private synthesizeInterfaceOrClass(
    decl: ts.InterfaceDeclaration | ts.ClassDeclaration,
    options: SynthesisOptions
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const itemIndex = options.itemIndex ?? 0;
    const enclosingName = decl.name?.text ?? options.enclosingTypeName;

    if (decl.heritageClauses) {
      for (const clause of decl.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const typeRef of clause.types) {
            const inheritedName = typeRef.getText();
            const inherited = this.synthesize(inheritedName, options);
            if (inherited && typeof inherited === 'object' && !Array.isArray(inherited)) {
              Object.assign(result, inherited);
            }
          }
        }
      }
    }

    for (const member of decl.members) {
      if ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && member.name) {
        const fieldName = member.name.getText().replace(/^['"]|['"]$/g, '');
        if (member.questionToken && OPTIONAL_ERROR_FIELDS.has(fieldName.toLowerCase())) {
          continue;
        }
        const constrainedValues = options.responseConstraints?.[fieldName];
        if (constrainedValues && constrainedValues.length > 0) {
          result[fieldName] = constrainedValues[itemIndex % constrainedValues.length];
          continue;
        }
        if (member.type) {
          result[fieldName] = this.synthesizeTypeNode(
            member.type,
            { ...options, ...(enclosingName ? { enclosingTypeName: enclosingName } : {}) },
            fieldName
          );
        } else {
          result[fieldName] = synthesizeStringValue(fieldName, itemIndex, enclosingName);
        }
      }
    }

    return enforceObjectCoherence(result, itemIndex);
  }

  private synthesizeTypeNode(typeNode: ts.TypeNode, options: SynthesisOptions, fieldName: string): unknown {
    const itemIndex = options.itemIndex ?? 0;
    const enclosingTypeName = options.enclosingTypeName;
    const constrainedValues = options.responseConstraints?.[fieldName];
    if (constrainedValues && constrainedValues.length > 0 && !ts.isArrayTypeNode(typeNode) && !ts.isTypeLiteralNode(typeNode)) {
      return constrainedValues[itemIndex % constrainedValues.length];
    }

    if (ts.isParenthesizedTypeNode(typeNode)) {
      return this.synthesizeTypeNode(typeNode.type, options, fieldName);
    }

    if (ts.isTypeReferenceNode(typeNode)) {
      const refName = typeNode.typeName.getText();
      if (options.typeParameterMap?.has(refName)) {
        const mappedType = options.typeParameterMap.get(refName)!;
        return this.synthesize(mappedType, options);
      }
      if (typeNode.typeArguments && typeNode.typeArguments.length > 0) {
        const resolvedArgs = typeNode.typeArguments.map((arg) => {
          const argText = arg.getText();
          return options.typeParameterMap?.get(argText) ?? argText;
        });
        return this.synthesize(`${refName}<${resolvedArgs.join(', ')}>`, options);
      }
      return this.synthesize(refName, options);
    }

    if (typeNode.kind === ts.SyntaxKind.StringKeyword) {
      return synthesizeStringValue(fieldName, itemIndex, enclosingTypeName);
    }

    if (typeNode.kind === ts.SyntaxKind.NumberKeyword) {
      return synthesizeNumberValue(fieldName, itemIndex, enclosingTypeName);
    }

    if (typeNode.kind === ts.SyntaxKind.BooleanKeyword) {
      return synthesizeBooleanValue(fieldName, itemIndex);
    }

    if (ts.isArrayTypeNode(typeNode)) {
      const lower = fieldName.toLowerCase();
      if (lower.includes('role')) {
        return ['admin', 'user'];
      }
      if (lower.includes('permission')) {
        return ['read', 'write', 'admin'];
      }
      if (lower.endsWith('ids') || lower.endsWith('_ids')) {
        return ['id_1001', 'id_1002', 'id_1003'];
      }
      if (
        typeNode.elementType.kind === ts.SyntaxKind.NumberKeyword &&
        (lower.includes('month') || enclosingTypeName?.toLowerCase().includes('month'))
      ) {
        return [6, 12, 24, 36, 48, 60];
      }
      const elementText = typeNode.elementType.getText();
      const resolvedElement = options.typeParameterMap?.get(elementText) ?? elementText;
      const count = this.getCollectionItemCount(resolvedElement, options);
      return Array.from({ length: count }, (_, idx) =>
        this.synthesizeTypeNode(
          typeNode.elementType,
          { ...options, itemIndex: idx, visitedCounts: new Map(options.visitedCounts ?? []) },
          fieldName
        )
      );
    }

    if (ts.isTypeLiteralNode(typeNode)) {
      const obj: Record<string, unknown> = {};
      for (const m of typeNode.members) {
        if (ts.isPropertySignature(m) && m.name && m.type) {
          const propName = m.name.getText().replace(/^['"]|['"]$/g, '');
          if (m.questionToken && OPTIONAL_ERROR_FIELDS.has(propName.toLowerCase())) {
            continue;
          }
          const propConstraints = options.responseConstraints?.[propName];
          if (propConstraints && propConstraints.length > 0) {
            obj[propName] = propConstraints[itemIndex % propConstraints.length];
          } else {
            obj[propName] = this.synthesizeTypeNode(m.type, options, propName);
          }
        }
      }
      return enforceObjectCoherence(obj, itemIndex);
    }

    if (ts.isIntersectionTypeNode(typeNode)) {
      const merged: Record<string, unknown> = {};
      for (const subType of typeNode.types) {
        const val = this.synthesizeTypeNode(subType, options, fieldName);
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.assign(merged, val);
        }
      }
      return enforceObjectCoherence(merged, itemIndex);
    }

    if (ts.isUnionTypeNode(typeNode)) {
      const nonNullTypes = typeNode.types.filter((t) => {
        if (
          t.kind === ts.SyntaxKind.NullKeyword ||
          t.kind === ts.SyntaxKind.UndefinedKeyword ||
          t.kind === ts.SyntaxKind.VoidKeyword
        ) {
          return false;
        }
        if (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword) {
          return false;
        }
        return true;
      });
      const candidates = nonNullTypes.length > 0 ? nonNullTypes : typeNode.types;
      const selectedType = candidates[itemIndex % Math.max(candidates.length, 1)] ?? candidates[0];
      if (selectedType) {
        return this.synthesizeTypeNode(selectedType, options, fieldName);
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

    return synthesizeStringValue(fieldName, itemIndex, enclosingTypeName);
  }
}

export function wrapInHybridEnvelope(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }
  const obj = body as Record<string, unknown>;

  const hasData = 'data' in obj;
  const hasResult = 'result' in obj;
  const hasPayload = 'payload' in obj;
  const hasSuccess = 'success' in obj || 'isSuccess' in obj;

  const hybrid: Record<string, unknown> = { ...obj };

  const tokenVal = (obj.accessToken || obj.token || obj.jwt || obj.access_token) as string | undefined;
  if (tokenVal) {
    if (!hybrid.accessToken) hybrid.accessToken = tokenVal;
    if (!hybrid.token) hybrid.token = tokenVal;
    if (!hybrid.jwt) hybrid.jwt = tokenVal;
    if (!hybrid.access_token) hybrid.access_token = tokenVal;
    if (!hybrid.tokenType && !hybrid.token_type) {
      hybrid.tokenType = 'Bearer';
      hybrid.token_type = 'Bearer';
    }
  }

  const baseClone = { ...hybrid };
  if (!hasData) {
    hybrid.data = baseClone;
  }
  if (!hasResult) {
    hybrid.result = baseClone;
  }
  if (!hasPayload) {
    hybrid.payload = baseClone;
  }
  if (!hasSuccess) {
    hybrid.success = true;
    hybrid.isSuccess = true;
  }
  if (!('status' in obj)) {
    hybrid.status = 200;
  }
  if (!('message' in obj)) {
    hybrid.message = 'Operation completed successfully';
  }

  return hybrid;
}

export function synthesizePayload(
  typeName: string,
  _typeChecker?: ts.TypeChecker | null,
  sourceCode?: string,
  filePath?: string,
  responseConstraints?: Record<string, Array<string | number | boolean>>
): GeneratedMock {
  const engine = new TypeSynthesizerEngine(sourceCode, filePath);
  const cleanType = unwrapTypeWrappers(typeName);
  const rawBody = engine.synthesize(cleanType, {
    depth: 0,
    maxDepth: 4,
    visitedCounts: new Map(),
    ...(responseConstraints ? { responseConstraints } : {}),
  });
  const body = wrapInHybridEnvelope(rawBody);

  return {
    statusCode: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body,
    rawBody: JSON.stringify(body, null, 2),
    schemaDescription: `Synthesized from generic <${cleanType}>`,
  };
}

export interface MockVariantSuite {
  ok200: GeneratedMock;
  empty200: GeneratedMock;
  loading200: GeneratedMock;
  mfa200: GeneratedMock;
  unauth401: GeneratedMock;
  forbidden403: GeneratedMock;
  notFound404: GeneratedMock;
  bad400: GeneratedMock;
  rateLimit429: GeneratedMock;
  server500: GeneratedMock;
  empty204: GeneratedMock;
  [key: string]: GeneratedMock;
}

export function generateMockVariants(
  typeName?: string,
  typeChecker?: ts.TypeChecker | null,
  sourceCode?: string,
  filePath?: string,
  endpointUrl?: string,
  responseConstraints?: Record<string, Array<string | number | boolean>>
): MockVariantSuite {
  const url = endpointUrl || '';
  const authScenarios = generateAuthScenarios();
  const isAuth = isAuthEndpoint(url) || (typeName ? isAuthEndpoint(typeName) : false);
  const is2fa = is2faEndpoint(url) || (typeName ? is2faEndpoint(typeName) : false);

  let ok200: GeneratedMock;

  if (typeName && typeName !== 'any' && typeName !== 'unknown') {
    const synthesized = synthesizePayload(typeName, typeChecker, sourceCode, filePath, responseConstraints);
    if (synthesized.body && typeof synthesized.body === 'object' && Object.keys(synthesized.body).length > 0) {
      ok200 = synthesized;
    } else if (isAuth) {
      ok200 = {
        statusCode: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `token=${authScenarios.loginSuccess.accessToken}; Path=/; SameSite=Lax`,
        },
        body: wrapInHybridEnvelope(is2fa ? authScenarios.mfaVerified : authScenarios.loginSuccess),
        rawBody: JSON.stringify(wrapInHybridEnvelope(is2fa ? authScenarios.mfaVerified : authScenarios.loginSuccess), null, 2),
        schemaDescription: is2fa ? '2FA Verification Successful' : 'Authentication Succeeded (JWT Issued)',
      };
    } else {
      ok200 = synthesized;
    }
  } else if (isAuth) {
    const baseAuthObj = {
      ...(is2fa ? authScenarios.mfaVerified : authScenarios.loginSuccess),
    } as Record<string, unknown>;
    if (responseConstraints) {
      for (const [k, vals] of Object.entries(responseConstraints)) {
        if (vals.length > 0) baseAuthObj[k] = vals[0];
      }
    }
    const wrapped = wrapInHybridEnvelope(baseAuthObj);
    ok200 = {
      statusCode: 200,
      statusText: 'OK',
      headers: is2fa
        ? { 'Content-Type': 'application/json' }
        : {
            'Content-Type': 'application/json',
            'Set-Cookie': `token=${authScenarios.loginSuccess.accessToken}; Path=/; SameSite=Lax`,
          },
      body: wrapped,
      rawBody: JSON.stringify(wrapped, null, 2),
      schemaDescription: is2fa ? '2FA Verification Successful (Session Authenticated)' : 'Authentication Succeeded (JWT Issued)',
    };
  } else {
    const fallbackObj: Record<string, unknown> = { status: 'success', message: 'Mock response' };
    if (responseConstraints) {
      for (const [k, vals] of Object.entries(responseConstraints)) {
        if (vals.length > 0) fallbackObj[k] = vals[0];
      }
    }
    const wrappedFallback = wrapInHybridEnvelope(fallbackObj);
    ok200 = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' },
      body: wrappedFallback,
      rawBody: JSON.stringify(wrappedFallback, null, 2),
      schemaDescription: 'Default 200 Mock',
    };
  }

  let emptyBody: unknown = {};
  if (Array.isArray(ok200.body)) {
    emptyBody = [];
  } else if (typeof ok200.body === 'object' && ok200.body !== null) {
    const obj = ok200.body as Record<string, unknown>;
    if ('results' in obj && Array.isArray(obj.results)) {
      emptyBody = { results: [], total_pages: 0, total_results: 0 };
    } else if ('data' in obj && Array.isArray(obj.data)) {
      emptyBody = { data: [], count: 0 };
    } else {
      emptyBody = {};
    }
  }

  const empty200: GeneratedMock = {
    statusCode: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: emptyBody,
    rawBody: JSON.stringify(emptyBody, null, 2),
    schemaDescription: 'Empty State (Zero Results)',
  };

  const mfa200: GeneratedMock = {
    statusCode: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
    body: authScenarios.mfaChallenge,
    rawBody: JSON.stringify(authScenarios.mfaChallenge, null, 2),
    schemaDescription: 'Two-Factor Authentication Challenge Required',
  };

  const unauth401: GeneratedMock = {
    statusCode: 401,
    statusText: 'Unauthorized',
    headers: { 'Content-Type': 'application/json' },
    body: authScenarios.unauthorized,
    rawBody: JSON.stringify(authScenarios.unauthorized, null, 2),
    schemaDescription: '401 Unauthorized (Expired or Missing Token)',
  };

  const forbidden403: GeneratedMock = {
    statusCode: 403,
    statusText: 'Forbidden',
    headers: { 'Content-Type': 'application/json' },
    body: authScenarios.forbidden,
    rawBody: JSON.stringify(authScenarios.forbidden, null, 2),
    schemaDescription: '403 Forbidden (Insufficient Permissions)',
  };

  const bad400Body = is2fa
    ? authScenarios.mfaInvalid
    : {
        error: 'Bad Request',
        message: 'Invalid payload parameters or missing required fields',
        code: 'ERR_INVALID_INPUT',
      };

  const bad400: GeneratedMock = {
    statusCode: 400,
    statusText: 'Bad Request',
    headers: { 'Content-Type': 'application/json' },
    body: bad400Body,
    rawBody: JSON.stringify(bad400Body, null, 2),
    schemaDescription: is2fa ? 'Invalid 2FA Verification Code' : 'Standard 400 Bad Request Error',
  };

  const rateLimit429: GeneratedMock = {
    statusCode: 429,
    statusText: 'Too Many Requests',
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': '60',
    },
    body: {
      error: 'Too Many Requests',
      message: 'API rate limit exceeded. Retry after 60 seconds.',
      retryAfter: 60,
    },
    rawBody: JSON.stringify(
      {
        error: 'Too Many Requests',
        message: 'API rate limit exceeded. Retry after 60 seconds.',
        retryAfter: 60,
      },
      null,
      2
    ),
    schemaDescription: '429 Rate Limit Exceeded',
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

  const loading200: GeneratedMock = {
    statusCode: ok200.statusCode,
    statusText: 'OK (Simulated Latency)',
    headers: { ...ok200.headers },
    body: ok200.body,
    rawBody: ok200.rawBody,
    schemaDescription: 'Loading State: Populated payload with 2000ms latency to test frontend spinners & suspense',
  };

  const notFound404: GeneratedMock = {
    statusCode: 404,
    statusText: 'Not Found',
    headers: { 'Content-Type': 'application/json' },
    body: {
      error: 'Not Found',
      message: 'The requested resource could not be found on this server',
      code: 'ERR_NOT_FOUND',
    },
    rawBody: JSON.stringify(
      {
        error: 'Not Found',
        message: 'The requested resource could not be found on this server',
        code: 'ERR_NOT_FOUND',
      },
      null,
      2
    ),
    schemaDescription: '404 Not Found (Missing Resource)',
  };

  const empty204: GeneratedMock = {
    statusCode: 204,
    statusText: 'No Content',
    headers: {},
    body: null,
    rawBody: '',
    schemaDescription: '204 No Content',
  };

  return {
    ok200,
    empty200,
    loading200,
    mfa200,
    unauth401,
    forbidden403,
    notFound404,
    bad400,
    rateLimit429,
    server500,
    empty204,
  };
}
