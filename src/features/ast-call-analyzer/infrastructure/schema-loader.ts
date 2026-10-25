import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DetectedApiCall, HttpMethod } from '../../../shared/kernel/index';

export interface DiscoveredSchemaEndpoint {
  method: HttpMethod;
  url: string;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  requestBodySchema?: unknown;
  responseSchemas?: Record<string, unknown>;
  sourceFile: string;
}

const SCHEMA_FILE_NAMES = new Set([
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml',
  'api-spec.json',
  'api-docs.json',
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.git',
  '.nx',
  '.angular',
  '.vscode',
  'coverage',
]);

export function normalizeOpenApiPath(p: string): string {
  let normalized = p.trim().replace(/\{([a-zA-Z0-9_-]+)\}/g, ':$1');
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized.replace(/\/+$/, '') || '/';
}

export function findSchemaFiles(dir: string, maxDepth = 4): string[] {
  const results: string[] = [];
  if (maxDepth <= 0 || !dir || !fs.existsSync(dir)) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name.toLowerCase()) && !entry.name.startsWith('.')) {
          results.push(...findSchemaFiles(path.join(dir, entry.name), maxDepth - 1));
        }
      } else if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();
        if (SCHEMA_FILE_NAMES.has(lowerName) || lowerName.endsWith('.swagger.json') || lowerName.endsWith('.openapi.json')) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  } catch {
  }

  return results;
}

export function parseOpenApiJson(jsonContent: string, sourceFile: string): DiscoveredSchemaEndpoint[] {
  const endpoints: DiscoveredSchemaEndpoint[] = [];
  try {
    const spec = JSON.parse(jsonContent);
    if (!spec || typeof spec !== 'object' || !spec.paths || typeof spec.paths !== 'object') {
      return endpoints;
    }

    const basePath = typeof spec.basePath === 'string' ? spec.basePath.replace(/\/+$/, '') : '';
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

    for (const [rawPath, pathItem] of Object.entries(spec.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      const fullPath = normalizeOpenApiPath(basePath ? `${basePath}${rawPath}` : rawPath);

      for (const m of httpMethods) {
        const operation = (pathItem as Record<string, any>)[m];
        if (operation && typeof operation === 'object') {
          const method = m.toUpperCase() as HttpMethod;
          const operationId = operation.operationId;
          const summary = operation.summary || operation.description;

          const responseSchemas: Record<string, unknown> = {};
          if (operation.responses && typeof operation.responses === 'object') {
            for (const [code, resp] of Object.entries(operation.responses)) {
              if (resp && typeof resp === 'object') {
                const respObj = resp as Record<string, any>;
                const schema = respObj.content?.['application/json']?.schema || respObj.schema;
                if (schema) {
                  responseSchemas[code] = schema;
                }
              }
            }
          }

          const requestBodySchema =
            operation.requestBody?.content?.['application/json']?.schema ||
            operation.parameters?.find((p: any) => p.in === 'body')?.schema;

          endpoints.push({
            method,
            url: fullPath,
            ...(operationId ? { operationId } : {}),
            ...(summary ? { summary } : {}),
            ...(Object.keys(responseSchemas).length > 0 ? { responseSchemas } : {}),
            ...(requestBodySchema ? { requestBodySchema } : {}),
            sourceFile,
          });
        }
      }
    }
  } catch {
  }

  return endpoints;
}

export function schemaEndpointToApiCall(endpoint: DiscoveredSchemaEndpoint): DetectedApiCall {
  return {
    id: `schema_${endpoint.method}_${endpoint.url.replace(/[^a-zA-Z0-9_]/g, '_')}`,
    method: endpoint.method,
    url: endpoint.url,
    clientType: 'openapi',
    ...(endpoint.operationId ? { typeArgument: endpoint.operationId } : {}),
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    rawExpression: `${endpoint.method} ${endpoint.url} (${endpoint.summary || 'OpenAPI Schema'})`,
    fileName: endpoint.sourceFile,
  };
}

export function discoverOpenApiSchemas(workspaceRoot: string): DiscoveredSchemaEndpoint[] {
  if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
    return [];
  }

  const schemaFiles = findSchemaFiles(workspaceRoot);
  const allEndpoints: DiscoveredSchemaEndpoint[] = [];

  for (const file of schemaFiles) {
    try {
      if (file.endsWith('.json')) {
        const content = fs.readFileSync(file, 'utf-8');
        const endpoints = parseOpenApiJson(content, file);
        allEndpoints.push(...endpoints);
      }
    } catch {
    }
  }

  return allEndpoints;
}
