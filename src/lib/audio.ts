/**
 * Thin imperative wrapper around expo-audio for the meditation session:
 * a looping ambient bed.
 */

import { Asset } from 'expo-asset';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

import type { AmbientSound, FileSound } from './types';
import { isGenerative } from './types';

// The lock-screen / Control Center artwork (the app's stardust mark), resolved
// once to a local URI for the now-playing media controls.
let artworkPromise: Promise<string | undefined> | null = null;
function resolveArtwork(): Promise<string | undefined> {
  if (!artworkPromise) {
    artworkPromise = (async () => {
      try {
        const asset = Asset.fromModule(require('@/assets/images/now-playing.png'));
        await asset.downloadAsync();
        return asset.localUri ?? asset.uri ?? undefined;
      } catch {
        return undefined;
      }
    })();
  }
  return artworkPromise;
}

// One source per sound, except the beats — each has two variants (different key
// + groove) and the session picks one at random for variety.
const AMBIENT_SOURCES: Record<FileSound, number | number[]> = {
  rain: require('@/assets/audio/ambient/rain.wav'),
  ocean: require('@/assets/audio/ambient/ocean.wav'),
  forest: require('@/assets/audio/ambient/forest.wav'),
  stream: require('@/assets/audio/ambient/stream.wav'),
  fire: require('@/assets/audio/ambient/fire.wav'),
  night: require('@/assets/audio/ambient/night.wav'),
  brown: require('@/assets/audio/ambient/brown.wav'),
  white: require('@/assets/audio/ambient/white.wav'),
  pink: require('@/assets/audio/ambient/pink.wav'),
  purr: require('@/assets/audio/purr.wav'),
  calm: require('@/assets/audio/music/calm.wav'),
  focus: require('@/assets/audio/music/focus.wav'),
  deep: require('@/assets/audio/music/deep.wav'),
  dream: require('@/assets/audio/music/dream.wav'),
  clarity: require('@/assets/audio/music/clarity.wav'),
  lofi: [require('@/assets/audio/beats/lofi-1.wav'), require('@/assets/audio/beats/lofi-2.wav')],
  liquid: [require('@/assets/audio/beats/liquid-1.wav'), require('@/assets/audio/beats/liquid-2.wav')],
  chillstep: [require('@/assets/audio/beats/chillstep-1.wav'), require('@/assets/audio/beats/chillstep-2.wav')],
  downtempo: [require('@/assets/audio/beats/downtempo-1.wav'), require('@/assets/audio/beats/downtempo-2.wav')],
  deephouse: [require('@/assets/audio/beats/deephouse-1.wav'), require('@/assets/audio/beats/deephouse-2.wav')],
  melodic: [require('@/assets/audio/beats/melodic-1.wav'), require('@/assets/audio/beats/melodic-2.wav')],
  techno: [require('@/assets/audio/beats/techno-1.wav'), require('@/assets/audio/beats/techno-2.wav')],
  triphop: [require('@/assets/audio/beats/triphop-1.wav'), require('@/assets/audio/beats/triphop-2.wav')],
  synthwave: [require('@/assets/audio/beats/synthwave-1.wav'), require('@/assets/audio/beats/synthwave-2.wav')],
};

/** All variant sources for a sound (a single-element list for most). */
function sourcesFor(ambient: FileSound): number[] {
  const src = AMBIENT_SOURCES[ambient];
  return Array.isArray(src) ? src : [src];
}

// How often a multi-variant beat evolves to its other variant mid-session.
const EVOLVE_MS = 200000; // ~3.3 minutes

// Track the last-applied mix mode so we re-apply only when it actually changes.
let appliedMix: boolean | null = null;

async function ensureAudioMode(mixWithMusic: boolean) {
  if (appliedMix === mixWithMusic) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      // Keep playing when the screen locks mid-session (matches the app's
      // background-audio capability), so meditation isn't cut off.
      shouldPlayInBackground: true,
      // Default: take over the session (pause other apps). Opt-in mixing lets
      // users lay Stillness over their own music.
      interruptionMode: mixWithMusic ? 'mixWithOthers' : 'doNotMix',
    });
    appliedMix = mixWithMusic;
  } catch {
    // Non-fatal: audio mode just falls back to platform defaults.
  }
}

export class SessionAudio {
  private ambient: AudioPlayer | null = null;
  private targetVol = 0.6;
  private mixWithMusic = false;
  private lockTitle: string | null = null;
  private artwork: string | undefined;
  private statusSub: ReturnType<AudioPlayer['addListener']> | null = null;
  private onPlaying?: (playing: boolean) => void;
  private lastPlaying: boolean | null = null;
  // Beat variants: the loaded sources, the current one, and the mid-session
  // "evolve" timer that crossfades to the other variant for within-session variety.
  private sources: number[] = [];
  private variantIdx = 0;
  private playing = false;
  private evolveTimer: ReturnType<typeof setInterval> | null = null;
  private evolving = false;
  // Only forward transport changes once we've actually started playing, so the
  // player's initial "not playing" status can't trip a spurious pause at startup.
  private emitStatus = false;

  /**
   * Notify when playback is toggled from *outside* the app (the lock screen /
   * control center), so the session UI can mirror a pause/resume it didn't
   * initiate. Deduped to real play/paused transitions.
   */
  setOnPlayingChange(cb: (playing: boolean) => void) {
    this.onPlaying = cb;
  }

  /** Set the background volume (0..1). */
  setVolume(v: number) {
    this.targetVol = 0.6 * Math.max(0, Math.min(1, v));
    if (this.ambient) {
      try {
        this.ambient.volume = this.targetVol;
      } catch {
        // ignore
      }
    }
  }

  async prepare(ambient: AmbientSound, mixWithMusic = false, lockScreenTitle?: string) {
    this.mixWithMusic = mixWithMusic;
    this.lockTitle = lockScreenTitle ?? null;
    this.artwork = await resolveArtwork();
    await ensureAudioMode(mixWithMusic);
    if (ambient !== 'none' && !isGenerative(ambient)) {
      this.sources = sourcesFor(ambient);
      this.variantIdx = Math.floor(Math.random() * this.sources.length);
      this.ambient = createAudioPlayer(this.sources[this.variantIdx]);
      this.ambient.loop = true;
      // Start silent so startAmbient() can fade in and avoid a click.
      this.ambient.volume = 0;
      // Mirror external (lock-screen) play/pause back to the session UI. Ignore
      // the transient pause/play that a mid-session variant swap produces.
      this.statusSub = this.ambient.addListener('playbackStatusUpdate', (status) => {
        if (this.evolving) return;
        const playing = !!status.playing;
        if (this.lastPlaying === playing) return;
        this.lastPlaying = playing;
        if (this.emitStatus) this.onPlaying?.(playing);
      });
    }
  }

  /** Start the loop and fade it in so it doesn't pop on the first sample. */
  startAmbient() {
    const player = this.ambient;
    if (!player) return;
    player.play();
    // We know we're playing now; baseline the state and start forwarding any
    // later external (lock-screen) transport changes.
    this.lastPlaying = true;
    this.emitStatus = true;
    // Show lock-screen / control-center playback info, but only when we own the
    // audio session (the API requires it). Best-effort: never let it break audio.
    if (!this.mixWithMusic) {
      try {
        player.setActiveForLockScreen(
          true,
          { title: this.lockTitle ?? 'Stillness', artist: 'Stillness', artworkUrl: this.artwork },
          { isLiveStream: true, showSeekForward: false, showSeekBackward: false },
        );
      } catch {
        // Lock-screen controls are a bonus; ignore if unavailable.
      }
    }
    void (async () => {
      const steps = 8;
      const target = this.targetVol;
      for (let i = 1; i <= steps; i++) {
        try {
          player.volume = (target * i) / steps;
        } catch {
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    })();
    // Beats with more than one variant evolve mid-session: every few minutes the
    // track crossfades (via a source swap) to its other variant — a gentle key
    // change so a long session doesn't loop the same groove forever.
    this.playing = true;
    if (this.sources.length > 1 && !this.evolveTimer) {
      this.evolveTimer = setInterval(() => void this.evolve(), EVOLVE_MS);
    }
  }

  /** Crossfade the single player to the next variant (fade out, swap, fade in). */
  private async evolve() {
    const player = this.ambient;
    if (!player || this.evolving || !this.playing || this.sources.length < 2) return;
    this.evolving = true;
    try {
      const next = (this.variantIdx + 1) % this.sources.length;
      await this.fadeTo(0, 1500);
      if (!this.playing) return; // paused mid-fade — leave it for resume
      player.replace(this.sources[next]);
      player.loop = true;
      player.volume = 0;
      player.play();
      this.variantIdx = next;
      await this.fadeTo(this.targetVol, 1800);
    } catch {
      // Best effort — never let an evolve break playback.
    } finally {
      this.evolving = false;
    }
  }

  /** Ramp the player volume to a target over `ms`. */
  private async fadeTo(target: number, ms: number) {
    const player = this.ambient;
    if (!player) return;
    const steps = 12;
    const start = player.volume ?? 0;
    for (let i = 1; i <= steps; i++) {
      try {
        player.volume = start + (target - start) * (i / steps);
      } catch {
        break;
      }
      await new Promise((r) => setTimeout(r, ms / steps));
    }
  }

  /** Pause the loop (keeps position), e.g. when the session is paused. */
  pauseAmbient() {
    this.playing = false;
    try {
      this.ambient?.pause();
    } catch {
      // ignore
    }
  }

  /** Resume after pauseAmbient(). */
  resumeAmbient() {
    this.playing = true;
    try {
      this.ambient?.play();
    } catch {
      // ignore
    }
  }

  /** Fade ambient out over a few hundred ms, then pause. */
  async stopAmbient() {
    this.playing = false;
    if (this.evolveTimer) {
      clearInterval(this.evolveTimer);
      this.evolveTimer = null;
    }
    const player = this.ambient;
    if (!player) return;
    try {
      const steps = 8;
      const start = player.volume;
      for (let i = 1; i <= steps; i++) {
        player.volume = start * (1 - i / steps);
        await new Promise((r) => setTimeout(r, 40));
      }
      player.pause();
    } catch {
      // ignore
    }
  }

  /** Release native resources. Call when leaving the session. */
  release() {
    this.onPlaying = undefined;
    this.playing = false;
    if (this.evolveTimer) {
      clearInterval(this.evolveTimer);
      this.evolveTimer = null;
    }
    try {
      this.statusSub?.remove();
    } catch {}
    this.statusSub = null;
    try {
      this.ambient?.clearLockScreenControls();
    } catch {}
    try {
      this.ambient?.remove();
    } catch {}
    this.ambient = null;
  }
}
