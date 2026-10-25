import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { spawn } from 'node:child_process';
import { assertLoopbackHost } from '../../../shared/kernel/index';
import type {
  BrowserLaunchOptions,
  BrowserLaunchResult,
  InstalledBrowserInfo,
} from '../domain/cdp.types';

export function getBrowserCandidates(customPath?: string): InstalledBrowserInfo[] {
  if (customPath && fs.existsSync(customPath)) {
    return [{ name: 'Custom Browser', path: customPath }];
  }

  const envBrowser = process.env.MOCKSCOPE_BROWSER_PATH;
  if (envBrowser && fs.existsSync(envBrowser)) {
    return [{ name: 'Environment Browser', path: envBrowser }];
  }

  const candidates: InstalledBrowserInfo[] = [];

  if (process.platform === 'win32') {
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';

    candidates.push(
      { name: 'Google Chrome', path: path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe') },
      { name: 'Google Chrome', path: path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe') },
      { name: 'Google Chrome', path: path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe') }
    );

    candidates.push(
      { name: 'Microsoft Edge', path: path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe') },
      { name: 'Microsoft Edge', path: path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe') },
      { name: 'Microsoft Edge', path: path.join(localAppData, 'Microsoft\\Edge\\Application\\msedge.exe') }
    );

    candidates.push(
      { name: 'Brave Browser', path: path.join(programFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') },
      { name: 'Brave Browser', path: path.join(programFilesX86, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') },
      { name: 'Brave Browser', path: path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe') }
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      { name: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { name: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { name: 'Brave Browser', path: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
      { name: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
      { name: 'Google Chrome Canary', path: '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary' }
    );
  } else {
    candidates.push(
      { name: 'Google Chrome', path: '/usr/bin/google-chrome' },
      { name: 'Google Chrome Stable', path: '/usr/bin/google-chrome-stable' },
      { name: 'Chromium', path: '/usr/bin/chromium' },
      { name: 'Chromium Browser', path: '/usr/bin/chromium-browser' },
      { name: 'Snap Chromium', path: '/snap/bin/chromium' },
      { name: 'Microsoft Edge', path: '/usr/bin/microsoft-edge' },
      { name: 'Microsoft Edge Stable', path: '/usr/bin/microsoft-edge-stable' },
      { name: 'Brave Browser', path: '/usr/bin/brave-browser' }
    );
  }

  return candidates;
}

export function findInstalledBrowser(customPath?: string): InstalledBrowserInfo | null {
  const candidates = getBrowserCandidates(customPath);
  for (const candidate of candidates) {
    if (candidate.path && fs.existsSync(candidate.path)) {
      return candidate;
    }
  }
  return null;
}

export function isPortListening(port: number, timeoutMs = 350): Promise<boolean> {
  assertLoopbackHost('127.0.0.1');

  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: '/json/version',
        timeout: timeoutMs,
      },
      (res) => {
        const isOk = res.statusCode === 200;
        res.destroy();
        resolve(isOk);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.on('error', () => {
      resolve(false);
    });
  });
}

export async function waitForPort(
  port: number,
  maxTimeoutMs = 6000,
  intervalMs = 150
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxTimeoutMs) {
    const listening = await isPortListening(port, 250);
    if (listening) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function launchBrowserWithDebugging(
  options: BrowserLaunchOptions = {}
): Promise<BrowserLaunchResult> {
  const port = options.port ?? 9222;
  const timeoutMs = options.timeoutMs ?? 7000;

  if (port <= 0 || port > 65535) {
    throw new Error(`Invalid debugging port: ${port}`);
  }

  const alreadyRunning = await isPortListening(port, 300);
  if (alreadyRunning) {
    return {
      browserName: 'Active Chromium Instance',
      executablePath: '',
      port,
      userDataDir: '',
    };
  }

  const browser = findInstalledBrowser(options.customBrowserPath);
  if (!browser) {
    throw new Error(
      'Could not find an installed Chromium-based browser (Google Chrome, Microsoft Edge, or Brave). Please install a Chromium browser or configure MOCKSCOPE_BROWSER_PATH.'
    );
  }

  const userDataDir =
    options.userDataDir ?? path.join(os.tmpdir(), 'mockscope-browser-profile');

  if (!fs.existsSync(userDataDir)) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
    } catch {
    }
  }

  const args: string[] = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (options.url) {
    args.push(options.url);
  } else {
    args.push('about:blank');
  }

  const child = spawn(browser.path, args, {
    detached: true,
    stdio: 'ignore',
    shell: false,
  });

  child.unref();

  const ready = await waitForPort(port, timeoutMs, 150);
  if (!ready) {
    throw new Error(
      `MockScope launched ${browser.name}, but debug port ${port} did not respond within ${timeoutMs}ms.`
    );
  }

  return {
    browserName: browser.name,
    executablePath: browser.path,
    port,
    userDataDir,
  };
}
