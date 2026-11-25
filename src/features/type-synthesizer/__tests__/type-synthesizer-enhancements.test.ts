import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { synthesizePayload, inspectTypeModel } from '../index';

describe('type-synthesizer enhancements', () => {
  it('should synthesize Date, ReadonlyArray<T>, and Record<string, T> cleanly', () => {
    const code = `
      interface AuditLog {
        timestamp: Date;
        tags: ReadonlyArray<string>;
        metadata: Record<string, number>;
      }
    `;
    const res = synthesizePayload('AuditLog', null, code);
    const body = res.body as any;
    expect(body.timestamp).toBe('2026-10-18T12:00:00Z');
    expect(Array.isArray(body.tags)).toBe(true);
    expect(body.tags.length).toBeGreaterThanOrEqual(1);
    expect(typeof body.metadata.item_1).toBe('number');
    expect(typeof body.metadata.item_2).toBe('number');
  });

  it('should inspect array and wrapped return types and extract underlying model + related types', () => {
    const code = `
      export enum TrafficSeverity {
        Info = 'info',
        Warn = 'warn',
      }

      export interface ApiTrafficEvent {
        id: string;
        method: 'GET' | 'POST';
        statusCode: number;
        severity: TrafficSeverity;
      }
    `;

    const model = inspectTypeModel('ApiTrafficEvent[]', code);
    expect(model.found).toBe(true);
    expect(model.baseTypeName).toBe('ApiTrafficEvent');
    expect(model.kind).toBe('interface');
    expect(model.definitionText).toContain('export interface ApiTrafficEvent');
    expect(model.definitionText).toContain('statusCode: number;');
    expect(model.relatedModels).toBeDefined();
    expect(model.relatedModels!.some((r) => r.name === 'TrafficSeverity' && r.kind === 'enum')).toBe(true);

    const inlineModel = inspectTypeModel('{ success: boolean; reason?: string }');
    expect(inlineModel.found).toBe(true);
    expect(inlineModel.kind).toBe('inline');
    expect(inlineModel.definitionText).toContain('success: boolean');
  });

  it('should resolve imported model filePath and line number across files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockscope-model-inspect-'));
    try {
      const modelsFile = path.join(tmpDir, 'telemetry.models.ts');
      const serviceFile = path.join(tmpDir, 'telemetry.service.ts');

      fs.writeFileSync(
        modelsFile,
        `// Header comment\nexport interface TelemetryPacket {\n  packetId: string;\n  bytes: number;\n}\n`,
        'utf-8'
      );
      const serviceCode = `import type { TelemetryPacket } from './telemetry.models';\nexport const load = () => fetch('/api/packets');\n`;
      fs.writeFileSync(serviceFile, serviceCode, 'utf-8');

      const resolved = inspectTypeModel('Promise<TelemetryPacket[]>', serviceCode, serviceFile);
      expect(resolved.found).toBe(true);
      expect(resolved.baseTypeName).toBe('TelemetryPacket');
      expect(resolved.filePath).toBe(modelsFile);
      expect(resolved.line).toBe(1);
      expect(resolved.definitionText).toContain('packetId: string;');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
