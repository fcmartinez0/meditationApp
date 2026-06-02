/**
 * Native stub for the generative music engine.
 *
 * Live procedural synthesis runs on the web (see generative.web.ts). On native
 * builds we don't synthesize in JS; the session falls back to a bundled track,
 * so this engine is a no-op and reports itself unsupported.
 */

import type { PieceSpec } from './types';

export const GENERATIVE_SUPPORTED = false;

export class GenerativeEngine {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async start(_spec: PieceSpec): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setVolume(_v: number): void {}
  pause(): void {}
  resume(): void {}
  stop(): void {}
}
