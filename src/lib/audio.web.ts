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

import type { AmbientSound, FileSound } from './types';
import { isGenerative } from './types';

// Beats have two variants each; the session picks one at random (matches native).
const AMBIENT_SOURCES: Record<FileSound, number | number[]> = {
  rain: require('@/assets/audio/ambient/rain.mp3'),
  ocean: require('@/assets/audio/ambient/ocean.mp3'),
  forest: require('@/assets/audio/ambient/forest.mp3'),
  stream: require('@/assets/audio/ambient/stream.mp3'),
  fire: require('@/assets/audio/ambient/fire.mp3'),
  night: require('@/assets/audio/ambient/night.mp3'),
  brown: require('@/assets/audio/ambient/brown.mp3'),
  white: require('@/assets/audio/ambient/white.mp3'),
  pink: require('@/assets/audio/ambient/pink.mp3'),
  purr: require('@/assets/audio/purr.mp3'),
  calm: require('@/assets/audio/music/calm.mp3'),
  focus: require('@/assets/audio/music/focus.mp3'),
  deep: require('@/assets/audio/music/deep.mp3'),
  dream: require('@/assets/audio/music/dream.mp3'),
  clarity: require('@/assets/audio/music/clarity.mp3'),
  // Lo-Fi folds in a real chill track (Sunward Ascent) alongside its two
  // generated variants; the session picks one per play (matches native rotation).
  lofi: [
    require('@/assets/audio/beats/lofi-1.mp3'),
    require('@/assets/audio/beats/lofi-2.mp3'),
    require('@/assets/audio/tracks/sunward-ascent.mp3'),
    require('@/assets/audio/tracks/velvet-midnight.mp3'),
  ],
  liquid: [require('@/assets/audio/beats/liquid-1.mp3'), require('@/assets/audio/beats/liquid-2.mp3')],
  chillstep: [require('@/assets/audio/beats/chillstep-1.mp3'), require('@/assets/audio/beats/chillstep-2.mp3')],
  downtempo: [
    require('@/assets/audio/beats/downtempo-1.mp3'),
    require('@/assets/audio/beats/downtempo-2.mp3'),
    require('@/assets/audio/tracks/gravel-and-keys.mp3'),
    require('@/assets/audio/tracks/seven-miles-until-dawn.mp3'),
  ],
  deephouse: [require('@/assets/audio/beats/deephouse-1.mp3'), require('@/assets/audio/beats/deephouse-2.mp3')],
  melodic: [require('@/assets/audio/beats/melodic-1.mp3'), require('@/assets/audio/beats/melodic-2.mp3')],
  techno: [
    require('@/assets/audio/beats/techno-1.mp3'),
    require('@/assets/audio/beats/techno-2.mp3'),
    require('@/assets/audio/tracks/grinding-floor.mp3'),
  ],
  triphop: [
    require('@/assets/audio/beats/triphop-1.mp3'),
    require('@/assets/audio/beats/triphop-2.mp3'),
    require('@/assets/audio/tracks/concrete-skin.mp3'),
    require('@/assets/audio/tracks/velvet-concrete.mp3'),
  ],
  synthwave: [require('@/assets/audio/beats/synthwave-1.mp3'), require('@/assets/audio/beats/synthwave-2.mp3')],
};

// Genres whose variant list folds in full "real" tracks (Gemini-generated) after
// the two generated beat loops — the index at which those tracks begin. Biases the
// pick toward a real track so the featured songs are reliably heard.
const FEATURE_TRACK_START: Partial<Record<FileSound, number>> = {
  lofi: 2,
  downtempo: 2,
  techno: 2,
  triphop: 2,
};

/** The full variant list for a sound (its sources, or a single source wrapped). */
function variantList(ambient: FileSound): number[] {
  const src = AMBIENT_SOURCES[ambient];
  return Array.isArray(src) ? src : [src];
}

/** Opening variant index — biased toward a real track when the genre folds one in. */
function pickInitialIndex(ambient: FileSound, list: number[]): number {
  const featStart = FEATURE_TRACK_START[ambient];
  if (featStart !== undefined && featStart < list.length && Math.random() < 0.6) {
    return featStart + Math.floor(Math.random() * (list.length - featStart));
  }
  return Math.floor(Math.random() * list.length);
}

let sharedCtx: AudioContext | null = null;
const bufferCache = new Map<number, AudioBuffer>();
let resumeHooked = false;

// Browsers suspend the audio context when the tab/app backgrounds or the screen
// locks; resume it on the next chance so playback continues instead of dying.
function hookResume() {
  if (resumeHooked || typeof window === 'undefined') return;
  resumeHooked = true;
  const resume = () => {
    if (sharedCtx && sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => {});
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', resume);
  window.addEventListener('focus', resume);
  ['touchstart', 'mousedown', 'keydown'].forEach((e) =>
    window.addEventListener(e, resume, { passive: true } as AddEventListenerOptions),
  );
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  hookResume();
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
const XFADE_SEC = 3.5; // overlapping crossfade length between variants

// Rotation pace scales with the user's session length (≈ a quarter of the
// session per variant, bounded) so short sessions still hear the mix move and
// long ones aren't churned. Matches the native dwell scaling.
function cycleMsForSession(sessionSec?: number): number {
  const quarter = (sessionSec ?? 0) * 250; // sessionSec/4 in ms
  return Math.min(150000, Math.max(60000, quarter || 150000));
}

export class SessionAudio {
  private ctx: AudioContext | null = null;
  private ambientBuffer: AudioBuffer | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private targetVol = TARGET_VOLUME;
  // Variant rotation: the loaded sources, the current one, and the crossfade timer.
  private sources: number[] = [];
  private variantIdx = 0;
  private cycleTimer: ReturnType<typeof setInterval> | null = null;
  private cycling = false;
  private playing = false;
  private cycleMs = cycleMsForSession();

  // No external transport (lock screen) on web; accepted for API parity.
  setOnPlayingChange(_cb: (playing: boolean) => void) {}

  /** Set the background volume (0..1). */
  setVolume(v: number) {
    this.targetVol = TARGET_VOLUME * Math.max(0, Math.min(1, v));
    const ctx = this.ctx;
    const gain = this.ambientGain;
    // Don't fight the crossfade ramps mid-cycle; they settle at the new target.
    if (ctx && gain && !this.cycling) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(SILENCE, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVol), now + 0.1);
    }
  }

  // mixWithMusic / lock-screen title are honoured natively; the browser mixes by
  // default and has no lock screen, so they're accepted for API parity only.
  async prepare(ambient: AmbientSound, _mixWithMusic = false, _lockScreenTitle?: string, sessionSec?: number) {
    this.cycleMs = cycleMsForSession(sessionSec);
    this.ctx = getCtx();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // playback resumes on the next user interaction
      }
    }
    if (ambient !== 'none' && !isGenerative(ambient)) {
      this.sources = variantList(ambient);
      this.variantIdx = pickInitialIndex(ambient, this.sources);
      this.ambientBuffer = await loadBuffer(this.sources[this.variantIdx], this.ctx);
    }
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
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVol), now + 0.5); // smooth fade in
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.ambientSource = src;
    this.ambientGain = gain;
    this.playing = true;
    // Rotate through the other variants mid-session (matches native), crossfading
    // so a long session doesn't loop one groove forever — and so the folded-in
    // real tracks are actually heard even if the session opened on a beat.
    if (this.sources.length > 1 && !this.cycleTimer) {
      this.cycleTimer = setInterval(() => void this.cycle(), this.cycleMs);
    }
  }

  /** Crossfade to the next variant: start it silently and ramp the two past each
   *  other over the same window, then release the outgoing source. */
  private async cycle() {
    const ctx = this.ctx;
    if (!ctx || this.cycling || !this.playing || this.sources.length < 2) return;
    this.cycling = true;
    const oldSrc = this.ambientSource;
    const oldGain = this.ambientGain;
    try {
      const next = (this.variantIdx + 1) % this.sources.length;
      const buffer = await loadBuffer(this.sources[next], ctx);
      if (!this.playing) return; // paused/stopped while the next buffer loaded
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(SILENCE, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVol), now + XFADE_SEC);
      src.connect(gain).connect(ctx.destination);
      src.start();
      if (oldSrc && oldGain) {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(Math.max(SILENCE, oldGain.gain.value), now);
        oldGain.gain.exponentialRampToValueAtTime(SILENCE, now + XFADE_SEC);
        try {
          oldSrc.stop(now + XFADE_SEC + 0.1);
        } catch {}
        oldSrc.onended = () => {
          try {
            oldSrc.disconnect();
            oldGain.disconnect();
          } catch {}
        };
      }
      this.ambientSource = src;
      this.ambientGain = gain;
      this.variantIdx = next;
    } catch {
      // Best effort — never let a cycle break playback.
    } finally {
      this.cycling = false;
    }
  }

  // A looping buffer can't truly pause, so mute it (it keeps looping silently).
  pauseAmbient() {
    this.playing = false;
    const ctx = this.ctx;
    const gain = this.ambientGain;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(SILENCE, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(SILENCE, now + 0.2);
  }

  resumeAmbient() {
    this.playing = true;
    const ctx = this.ctx;
    const gain = this.ambientGain;
    if (!ctx || !gain) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(SILENCE, gain.gain.value), now);
    gain.gain.exponentialRampToValueAtTime(Math.max(SILENCE, this.targetVol), now + 0.3);
  }

  async stopAmbient() {
    this.playing = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
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
    this.playing = false;
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.disposeSource();
    this.ctx = null;
    this.ambientBuffer = null;
  }
}
