import { describe, it, expect, vi, afterEach } from 'vitest';
import * as http from 'node:http';
import * as path from 'node:path';
import {
  getBrowserCandidates,
  findInstalledBrowser,
  isPortListening,
  waitForPort,
  launchBrowserWithDebugging,
} from '../infrastructure/browser-launcher';
import { CdpBridgeController } from '../infrastructure/cdp-controller';

describe('browser-launcher', () => {
  let server: http.Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
    vi.restoreAllMocks();
  });

  it('should return valid browser candidates for the current OS', () => {
    const candidates = getBrowserCandidates();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.name).toBeTruthy();
      expect(c.path).toBeTruthy();
    }
  });

  it('should prioritize custom browser path if provided and exists', () => {
    const existingFile = path.resolve(__dirname, '../../../../package.json');
    const candidates = getBrowserCandidates(existingFile);
    expect(candidates[0].name).toBe('Custom Browser');
    expect(candidates[0].path).toBe(existingFile);

    const found = findInstalledBrowser(existingFile);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Custom Browser');
  });

  it('should correctly report false when port is not listening', async () => {
    const listening = await isPortListening(59123, 100);
    expect(listening).toBe(false);
  });

  it('should correctly report true when port is listening on /json/version', async () => {
    const port = await new Promise<number>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const listening = await isPortListening(port, 500);
    expect(listening).toBe(true);
  });

  it('waitForPort should return true when port is already listening', async () => {
    const port = await new Promise<number>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const ready = await waitForPort(port, 1000, 50);
    expect(ready).toBe(true);
  });

  it('waitForPort should return false when port does not respond within timeout', async () => {
    const ready = await waitForPort(59876, 200, 50);
    expect(ready).toBe(false);
  });

  it('launchBrowserWithDebugging should reject invalid ports', async () => {
    await expect(launchBrowserWithDebugging({ port: -1 })).rejects.toThrow('Invalid debugging port');
    await expect(launchBrowserWithDebugging({ port: 70000 })).rejects.toThrow('Invalid debugging port');
  });

  it('launchBrowserWithDebugging should return immediately if port is already active', async () => {
    const port = await new Promise<number>((resolve) => {
      server = http.createServer((req, res) => {
        if (req.url === '/json/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/browser' }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server!.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });

    const result = await launchBrowserWithDebugging({ port });
    expect(result.port).toBe(port);
    expect(result.browserName).toContain('Active');
  });

  it('CdpBridgeController should reject if autoLaunch is false and port is inactive', async () => {
    const controller = new CdpBridgeController(59999);
    await expect(controller.attach({ autoLaunch: false })).rejects.toThrow(
      'Unable to connect to Chrome debugging port 59999 on 127.0.0.1'
    );
  });
});
