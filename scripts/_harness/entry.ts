// Harness entry: re-exports just the bits the renderer needs from the real
// engine, so esbuild bundles the actual app synthesis code (no re-implementation).
export { __renderSpecForHarness } from '../../src/lib/generative';
export { nextSpec } from '../../src/lib/preferences';
