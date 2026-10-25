export {
  unwrapTypeWrappers,
  TypeSynthesizerEngine,
  synthesizePayload,
  generateMockVariants,
  type MockVariantSuite,
} from './infrastructure/type-resolver';
export {
  synthesizeStringValue,
  synthesizeNumberValue,
  synthesizeBooleanValue,
} from './domain/heuristics';
export {
  datasetProvider,
  DatasetProvider,
  type CustomDatasetPools,
  type HybridSeederState,
} from './domain/datasets/index';
export {
  generatePlaceholderSvg,
  generatePlaceholderDataUri,
  detectImageType,
  type PlaceholderOptions,
} from './domain/media-placeholder';
export {
  generateMockJwt,
  isAuthEndpoint,
  is2faEndpoint,
  generateAuthScenarios,
  type AuthScenarioPayloads,
} from './domain/auth-mock';

