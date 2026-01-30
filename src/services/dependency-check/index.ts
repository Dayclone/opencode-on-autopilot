/**
 * Re-organized dependency checking service - main entry point
 */
// Re-export types for backward compatibility
export type { DependencyCheckResult, DependencyCheckResults } from './types';

// Re-export main functions
export { runDependencyCheck } from './main';
export { showDependencyStatus } from './status';