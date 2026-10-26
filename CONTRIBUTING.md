# Contributing to MockScope

Thank you for your interest in contributing to MockScope.

## Development Setup

Requirements:
- Node.js >= 20.x
- npm >= 10.x
- VS Code >= 1.85.0

```bash
git clone https://github.com/burdu-13/MockScope.git
cd MockScope
npm install
npm run build
```

## Available Scripts

- `npm run build` - Bundle the extension via esbuild into `dist/extension.js`.
- `npm run watch` - Continuously re-bundle on code changes.
- `npm test` - Run unit and integration tests using Vitest.
- `npm run test:coverage` - Generate test coverage report (>85% enforced).
- `npm run typecheck` - Run strict TypeScript compiler verification (`tsc --noEmit`).

## Architectural Guardrails

Every contribution must adhere to the following principles:

1. **Feature-Sliced Architecture (FSA)**:
   - Slices in `src/features/*` must remain independent and decoupled.
   - Core domain logic (AST scanning, proxying, mock synthesis) must have zero imports from `vscode`. Only presentation adapters (CodeLens, Webviews, Status Bar) may import `vscode`.

2. **Zero-Trust Security**:
   - All network servers must bind strictly to `127.0.0.1`.
   - Never add outbound telemetry or remote tracking.

3. **Performance Budgets**:
   - Extension activation budget: < 35 ms.
   - AST scanning budget: < 3 ms average per file.
   - In-memory traffic ledger capped at 100 entries via circular ring buffer (< 35 MB RAM).

4. **Code Quality**:
   - Maintain 100% clean test passes and strict TypeScript checks.
   - Preserve existing code conventions.

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Ensure `npm run typecheck` and `npm test` pass with zero errors.
3. Open a pull request with a descriptive summary of your changes.
