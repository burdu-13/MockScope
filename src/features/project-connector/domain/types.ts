export interface ConnectionResult {
  success: boolean;
  strategy: 'vite' | 'nextjs' | 'angular' | 'nuxt' | 'package-proxy' | 'env';
  targetFile: string;
  backupFile?: string | undefined;
  message: string;
}

export interface DisconnectionResult {
  success: boolean;
  restoredFile: string;
  message: string;
}

export interface ProjectConnectionStatus {
  isConnected: boolean;
  strategy?: string | undefined;
  targetFile?: string | undefined;
  proxyUrl: string;
}
