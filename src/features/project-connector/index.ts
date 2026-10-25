export {
  autoConnectProject,
  disconnectProject,
  getProjectConnectionStatus,
  extractPrefixes,
  findEnvironmentFiles,
  patchAngularEnvironments,
  restoreAngularEnvironments,
} from './infrastructure/connector';
export type {
  ConnectionResult,
  DisconnectionResult,
  ProjectConnectionStatus,
} from './domain/types';
