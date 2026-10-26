# Security Policy

## Security Architecture & Zero-Trust Sandbox

MockScope is designed from the ground up with a zero-trust, local-only security architecture:

1. **Strict Loopback Binding (`127.0.0.1`)**:
   All embedded proxy services, Chrome DevTools Protocol bridges, and WebSockets bind exclusively to `127.0.0.1`. MockScope never listens on `0.0.0.0` or external network adapters.

2. **Zero Outbound Telemetry / Zero Egress**:
   MockScope makes zero outbound network requests to external servers, analytics pipelines, or cloud telemetry. It is 100% offline and air-gap compatible.

3. **Strict Content Security Policy (CSP)**:
   Every Webview panel enforces a strict cryptographic nonce-based CSP (`'nonce-${nonce}'`). No external CDN scripts, remote fonts, or inline script injections are permitted.

4. **Transient Credential Handling**:
   Captured Authorization headers, bearer tokens, API keys, and session cookies are automatically redacted in-memory and never written to disk, persistent logs, or workspace files.

## Reporting a Vulnerability

If you discover a security vulnerability within MockScope:
1. Please do not open a public GitHub issue.
2. Submit a report through GitHub Private Vulnerability Reporting under the **Security** tab of this repository.
3. Include details of the vulnerability, reproduction steps, and potential impact.
4. Security advisories will be published alongside patched releases.
