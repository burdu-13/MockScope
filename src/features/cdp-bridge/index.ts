export { CdpBridgeController, attachBrowser } from './infrastructure/cdp-controller';
export {
  launchBrowserWithDebugging,
  findInstalledBrowser,
  getBrowserCandidates,
  isPortListening,
  waitForPort,
} from './infrastructure/browser-launcher';
export type {
  CdpController,
  CdpAttachOptions,
  InstalledBrowserInfo,
  BrowserLaunchOptions,
  BrowserLaunchResult,
  ChromeVersionInfo,
  FetchRequestPausedParams,
} from './domain/cdp.types';
