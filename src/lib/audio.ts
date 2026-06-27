/**
 * Thin imperative wrapper around expo-audio for the session:
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

// One source per sound, except the beats — each has multiple variants and the
// session rotates through them (crossfading) for within-session variety.
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
  // Lo-Fi mixes the two generated variants with two real late-night tracks
  // (Sunward Ascent, brighter; Velvet Midnight, darker): the session crossfades
  // between them so a real song surfaces and recedes amid the generated grooves.
  lofi: [
    require('@/assets/audio/beats/lofi-1.mp3'),
    require('@/assets/audio/beats/lofi-2.mp3'),
    require('@/assets/audio/tracks/sunward-ascent.mp3'),
    require('@/assets/audio/tracks/velvet-midnight.mp3'),
  ],
  liquid: [require('@/assets/audio/beats/liquid-1.mp3'), require('@/assets/audio/beats/liquid-2.mp3')],
  chillstep: [require('@/assets/audio/beats/chillstep-1.mp3'), require('@/assets/audio/beats/chillstep-2.mp3')],
  // Downtempo folds in two real dreamy tracks (Gravel & Keys, D minor ~99 BPM;
  // Seven Miles Until Dawn, G minor ~61 BPM, brighter & atmospheric).
  downtempo: [
    require('@/assets/audio/beats/downtempo-1.mp3'),
    require('@/assets/audio/beats/downtempo-2.mp3'),
    require('@/assets/audio/tracks/gravel-and-keys.mp3'),
    require('@/assets/audio/tracks/seven-miles-until-dawn.mp3'),
  ],
  deephouse: [require('@/assets/audio/beats/deephouse-1.mp3'), require('@/assets/audio/beats/deephouse-2.mp3')],
  melodic: [require('@/assets/audio/beats/melodic-1.mp3'), require('@/assets/audio/beats/melodic-2.mp3')],
  // Ambient Techno folds in a real gritty track (Grinding Floor, G minor).
  techno: [
    require('@/assets/audio/beats/techno-1.mp3'),
    require('@/assets/audio/beats/techno-2.mp3'),
    require('@/assets/audio/tracks/grinding-floor.mp3'),
  ],
  // Trip-Hop folds in two real slow, warm tracks (Concrete Skin & Velvet
  // Concrete, both F major ~60 BPM, different shades of dark).
  triphop: [
    require('@/assets/audio/beats/triphop-1.mp3'),
    require('@/assets/audio/beats/triphop-2.mp3'),
    require('@/assets/audio/tracks/concrete-skin.mp3'),
    require('@/assets/audio/tracks/velvet-concrete.mp3'),
  ],
  synthwave: [require('@/assets/audio/beats/synthwave-1.mp3'), require('@/assets/audio/beats/synthwave-2.mp3')],
};

/** Sources to (cross)fade through for a sound — its variant list, or a single source. */
function sourcesFor(ambient: FileSound): number[] {
  const src = AMBIENT_SOURCES[ambient];
  return Array.isArray(src) ? src : [src];
}

// Cycling between variants is driven by playback position so a transition lands
// at a track's natural end (or a loop seam) instead of cutting it off mid-track.
const MIN_DWELL_MS = 90000; // play a variant at least this long before moving on
const MAX_DWELL_MS = 240000; // safety cap (e.g. if duration is never reported)
const END_LEAD_SEC = 2.5; // start the crossfade this far before the track ends

// Track the last-applied mix mode so we re-apply only when it actually changes.
let appliedMix: boolean | null = null;

async function ensureAudioMode(mixWithMusic: boolean) {
  if (appliedMix === mixWithMusic) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      // Keep playing when the screen locks mid-session (matches the app's
      // background-audio capability), so a session isn't cut off.
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
  // When the current variant started playing — used to decide when to cycle.
  private dwellStart = 0;
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
      // Start on a random variant so repeat sessions don't always open the same.
      this.variantIdx = Math.floor(Math.random() * this.sources.length);
      this.ambient = createAudioPlayer(this.sources[this.variantIdx]);
      this.ambient.loop = true;
      // Start silent so startAmbient() can fade in and avoid a click.
      this.ambient.volume = 0;
      // Mirror external (lock-screen) play/pause back to the session UI. Ignore
      // the transient pause/play that a mid-session variant swap produces.
      this.statusSub = this.ambient.addListener('playbackStatusUpdate', (status) => {
        // Cycle at the track's natural end (after a minimum dwell), not mid-track.
        this.maybeCycle(status.currentTime ?? 0, status.duration ?? 0);
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
    this.dwellStart = Date.now();
    // Safety fallback only: if a platform never reports duration (so the
    // position-based cycle can't fire), force a move once the max dwell elapses.
    if (this.sources.length > 1 && !this.evolveTimer) {
      this.evolveTimer = setInterval(() => {
        if (this.playing && !this.evolving && Date.now() - this.dwellStart >= MAX_DWELL_MS) void this.evolve();
      }, 15000);
    }
  }

  /** Decide, from the current playback position, whether to cycle to the next
   *  variant — triggering only near the track's end so it isn't cut off. */
  private maybeCycle(currentTime: number, duration: number) {
    if (this.sources.length < 2 || !this.playing || this.evolving) return;
    if (Date.now() - this.dwellStart < MIN_DWELL_MS) return;
    if (duration > 0 && currentTime >= duration - END_LEAD_SEC) void this.evolve();
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
      this.dwellStart = Date.now(); // reset the dwell clock for the new variant
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
