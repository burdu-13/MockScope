import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/shared/kernel/**',
        'src/shared/cdp/**',
        'src/features/ast-call-analyzer/**',
        'src/features/type-synthesizer/**',
        'src/features/runtime-proxy/**',
        'src/features/cdp-bridge/**',
        'src/features/test-exporter/**',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.types.ts',
        'src/**/presentation/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
