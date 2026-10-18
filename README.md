# MockScope

> Ultra-fast, zero-trust API mocking and traffic interception directly from your editor.

MockScope is a high-performance VS Code extension designed to detect HTTP/API call sites (`fetch`, `axios`, `useQuery`, Angular `HttpClient`) directly in the editor buffer, synthesize realistic mock payloads based on TypeScript generic return types (`<T>`), provide inline CodeLens presentation, intercept and route traffic locally via an embedded reverse proxy or direct Chrome DevTools Protocol (CDP), and export 1-click test code blocks for Playwright and MSW v2.

---

## 🚀 Key Features

* **⚡ Ultra-Fast AST Scanning (< 3 ms):** Detects `fetch`, `axios.<verb><T>`, TanStack `useQuery`, and Angular `HttpClient` call sites using a lightweight, non-blocking TypeScript AST parser with 300 ms debouncing.
* **🧬 TypeScript Type Synthesis:** Resolves generic return types (`<T>`) into realistic mock data variants (200 OK, 400 Bad Request, 500 Server Error, 204 Empty) with recursion protection (depth limit: 3).
* **🌐 Local Loopback Proxy (`127.0.0.1:45990`):** Embedded reverse proxy serving mock responses, simulating network latency, and providing CORS preflight support.
* **🔌 Direct Browser CDP Bridge:** Intercepts live browser network traffic at the wire level via Chrome DevTools Protocol (`Fetch.enable`, `Fetch.fulfillRequest`).
* **📋 1-Click Test Exporter:** Instantly copy ready-to-paste mock specifications for **Playwright** (`page.route()`) and **MSW v2** (`http.get/post()`).
* **🛡️ Zero-Trust Security Sandbox:** 100% offline and air-gapped. Zero external telemetry, loopback-only binding (`127.0.0.1`), strict Webview CSP nonces, and automatic credential redaction (Authorization, Cookies).
* **📊 Live Traffic & Route Table Webview:** Fixed-capacity circular ring buffer (100 entries, < 35 MB RAM cap) providing a real-time dashboard of all intercepted requests and active mock rules.

---

## 🏛️ Architecture

MockScope is built following **Feature-Sliced Architecture (FSA)** principles:

```
src/
├── app/                          # Composition root & extension lifecycle (extension.ts)
├── features/                     # Vertical domain slices
│   ├── ast-call-analyzer/        # AST parsing & HTTP call extraction (<3ms)
│   ├── type-synthesizer/         # Type <T> mock generator with heuristics
│   ├── runtime-proxy/            # Local loopback HTTP reverse proxy & route table
│   ├── cdp-bridge/               # Wire-level Chrome DevTools Protocol Fetch interceptor
│   ├── codelens-provider/        # VS Code inline CodeLens presentation layer
│   └── test-exporter/            # Playwright page.route & MSW v2 handler generator
└── shared/                       # Shared domain primitives
    ├── kernel/                   # Ring buffer, credential sanitizer, event bus, types
    ├── cdp/                      # Low-level loopback CDP WebSocket client
    └── ui/                       # Dashboard Webview view provider & strict CSP nonces
```

---

## 🛠️ Development & Testing

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run unit and integration tests
npm test

# Run tests with coverage (>85% enforced)
npm run test:coverage

# Build production bundle with esbuild (<350 KB target)
npm run build
```