/**
 * Web implementation of the session audio, mirroring the native `audio.ts` API.
 *
 * The native build loops via expo-audio, but on the web that path uses an HTML
 * media element whose `loop` inserts a small gap each cycle. Here we decode the
 * clips into the Web Audio API and loop an AudioBufferSourceNode, which is
 * sample-accurate and therefore gapless.
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
  beats: require('@/assets/audio/music/beats.wav'),
};

async function resolveUri(mod: number): Promise<string> {
  const asset = Asset.fromModule(mod);
  if (!asset.downloaded) await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export class SessionAudio {
  private ctx: AudioContext | null = null;
  private bellBuffer: AudioBuffer | null = null;
  private ambientBuffer: AudioBuffer | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;

  private async decode(mod: number, ctx: AudioContext): Promise<AudioBuffer> {
    const uri = await resolveUri(mod);
    const res = await fetch(uri);
    const data = await res.arrayBuffer();
    return await ctx.decodeAudioData(data);
  }

  async prepare(ambient: AmbientSound) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    // Resume in case the context starts suspended (autoplay policy).
    try {
      await this.ctx.resume();
    } catch {
      // ignore — playback simply waits for the next interaction
    }
    this.bellBuffer = await this.decode(BELL_SOURCE, this.ctx);
    if (ambient !== 'none') {
      this.ambientBuffer = await this.decode(AMBIENT_SOURCES[ambient], this.ctx);
    }
  }

  ringBell() {
    if (!this.ctx || !this.bellBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.bellBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  startAmbient() {
    if (!this.ctx || !this.ambientBuffer) return;
    void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.ambientBuffer;
    src.loop = true; // gapless, sample-accurate loop
    const gain = this.ctx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain).connect(this.ctx.destination);
    src.start();
    this.ambientSource = src;
    this.ambientGain = gain;
  }

  async stopAmbient() {
    if (!this.ctx || !this.ambientSource || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    try {
      this.ambientGain.gain.cancelScheduledValues(now);
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
      this.ambientGain.gain.linearRampToValueAtTime(0, now + 0.4);
      this.ambientSource.stop(now + 0.45);
    } catch {
      // ignore
    }
    this.ambientSource = null;
    this.ambientGain = null;
  }

  release() {
    try {
      this.ambientSource?.stop();
    } catch {}
    this.ambientSource = null;
    this.ambientGain = null;
    try {
      void this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}
