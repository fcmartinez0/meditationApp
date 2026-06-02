/**
 * Web implementation of the session audio, mirroring the native `audio.ts` API.
 *
 * Design notes (these fix audible web glitches):
 *  - ONE shared, long-lived AudioContext. Creating/closing a context per
 *    session caused glitches on the tail of playback.
 *  - Decoded buffers are cached, so re-selecting a track is instant.
 *  - startAmbient() always stops any previous loop first; two overlapping
 *    copies of the same loop comb-filter into a "robotic/flanger" sound.
 *  - Fades use exponentialRampToValueAtTime for click-free in/out.
 */

import { Asset } from 'expo-asset';

import type { AmbientSound } from './types';

const BELL_SOURCE = require('@/assets/audio/bell.wav');

const AMBIENT_SOURCES: Record<Exclude<AmbientSound, 'none'>, number> = {
  rain: require('@/assets/audio/ambient/rain.wav'),
  ocean: require('@/assets/audio/ambient/ocean.wav'),
  forest: require('@/assets/audio/ambient/forest.wav'),
  calm: require('@/assets/audio/music/calm.wav'),
  focus: require('@/assets/audio/music/focus.wav'),
  deep: require('@/assets/audio/music/deep.wav'),
  lofi: require('@/assets/audio/beats/lofi.wav'),
  liquid: require('@/assets/audio/beats/liquid.wav'),
  chillstep: require('@/assets/audio/beats/chillstep.wav'),
  downtempo: require('@/assets/audio/beats/downtempo.wav'),
};

let sharedCtx: AudioContext | null = null;
const bufferCache = new Map<number, AudioBuffer>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  return sharedCtx;
}

async function loadBuffer(mod: number, ctx: AudioContext): Promise<AudioBuffer> {
  const cached = bufferCache.get(mod);
  if (cached) return cached;
  const asset = Asset.fromModule(mod);
  if (!asset.downloaded) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const res = await fetch(uri);
  const data = await res.arrayBuffer();
  const buffer = await ctx.decodeAudioData(data);
  bufferCache.set(mod, buffer);
  return buffer;
}

const TARGET_VOLUME = 0.6;
const SILENCE = 0.0001; // exponential ramps can't reach exactly 0

export class SessionAudio {
  private ctx: AudioContext | null = null;
  private bellBuffer: AudioBuffer | null = null;
  private ambientBuffer: AudioBuffer | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;

  async prepare(ambient: AmbientSound) {
    this.ctx = getCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // playback resumes on the next user interaction
      }
    }
    this.bellBuffer = await loadBuffer(BELL_SOURCE, this.ctx);
    if (ambient !== 'none') {
      this.ambientBuffer = await loadBuffer(AMBIENT_SOURCES[ambient], this.ctx);
    }
  }

  ringBell() {
    const ctx = this.ctx;
    if (!ctx || !this.bellBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.bellBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  startAmbient() {
    const ctx = this.ctx;
    if (!ctx || !this.ambientBuffer) return;
    if (ctx.state === 'suspended') void ctx.resume();
    // Never allow two loops at once (the cause of the flanger/robotic sound).
    this.disposeSource();
    const src = ctx.createBufferSource();
    src.buffer = this.ambientBuffer;
    src.loop = true;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(SILENCE, now);
    gain.gain.exponentialRampToValueAtTime(TARGET_VOLUME, now + 0.5); // smooth fade in
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.ambientSource = src;
    this.ambientGain = gain;
  }

  async stopAmbient() {
    const ctx = this.ctx;
    const src = this.ambientSource;
    const gain = this.ambientGain;
    if (!ctx || !src || !gain) return;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(SILENCE, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(SILENCE, now + 0.6); // smooth fade out
      src.stop(now + 0.66);
      // Let the node release itself once the fade completes.
      src.onended = () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {}
      };
    } catch {}
    // Detach references immediately so nothing restarts or double-stops this node.
    this.ambientSource = null;
    this.ambientGain = null;
  }

  private disposeSource() {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {}
      try {
        this.ambientSource.disconnect();
      } catch {}
      this.ambientSource = null;
    }
    if (this.ambientGain) {
      try {
        this.ambientGain.disconnect();
      } catch {}
      this.ambientGain = null;
    }
  }

  release() {
    // Keep the shared context alive for the next session; just stop our source.
    this.disposeSource();
    this.ctx = null;
    this.bellBuffer = null;
    this.ambientBuffer = null;
  }
}
