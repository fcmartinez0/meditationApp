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
// once to a local URI for the now-playing media controls. Reuses the app icon —
// they were byte-identical, so a separate file was just dead weight.
let artworkPromise: Promise<string | undefined> | null = null;
function resolveArtwork(): Promise<string | undefined> {
  if (!artworkPromise) {
    artworkPromise = (async () => {
      try {
        const asset = Asset.fromModule(require('@/assets/images/icon.png'));
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

// Genres whose variant list folds in full "real" tracks (Gemini-generated) after
// the two generated beat loops — the index at which those tracks begin. Used to
// bias the opening variant toward a real track so it's reliably heard rather than
// only surfacing on a lucky random draw.
const FEATURE_TRACK_START: Partial<Record<FileSound, number>> = {
  lofi: 2,
  downtempo: 2,
  techno: 2,
  triphop: 2,
};

// Cycling between variants is driven by playback position so a transition lands
// at a track's natural end (or a loop seam) instead of cutting it off mid-track.
const XFADE_MS = 3500; // length of the overlapping crossfade between variants
const END_LEAD_SEC = 4.5; // begin the crossfade this far before the track ends (> XFADE so it fully overlaps)

// Dwell scales with the user's session length so short sessions still hear the
// mix move (a 5-min session shouldn't sit on one groove) while long sessions
// aren't churned. Target ≈ a quarter of the session per variant, within bounds.
function dwellForSession(sessionSec?: number): { min: number; max: number } {
  const quarter = (sessionSec ?? 0) * 250; // sessionSec/4 in ms
  const min = Math.min(90000, Math.max(45000, quarter || 90000));
  return { min, max: Math.min(240000, min * 2.5) };
}

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
  // When the current variant started playing — used to decide when to cycle —
  // and the session-scaled dwell bounds (set in prepare()).
  private dwellStart = 0;
  private dwell = dwellForSession();
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
    // Don't poke the players mid-crossfade — the ramps own their volume then and
    // will settle at the new target. Otherwise apply immediately.
    if (this.ambient && !this.evolving) {
      try {
        this.ambient.volume = this.targetVol;
      } catch {
        // ignore
      }
    }
  }

  async prepare(ambient: AmbientSound, mixWithMusic = false, lockScreenTitle?: string, sessionSec?: number) {
    this.mixWithMusic = mixWithMusic;
    this.lockTitle = lockScreenTitle ?? null;
    this.dwell = dwellForSession(sessionSec);
    this.artwork = await resolveArtwork();
    await ensureAudioMode(mixWithMusic);
    if (ambient !== 'none' && !isGenerative(ambient)) {
      this.sources = sourcesFor(ambient);
      // Start on a random variant so repeat sessions don't always open the same —
      // but for genres that include a real track, open on one ~60% of the time so
      // the featured songs are actually heard (they used to be a rare draw).
      const featStart = FEATURE_TRACK_START[ambient as FileSound];
      if (featStart !== undefined && featStart < this.sources.length && Math.random() < 0.6) {
        this.variantIdx = featStart + Math.floor(Math.random() * (this.sources.length - featStart));
      } else {
        this.variantIdx = Math.floor(Math.random() * this.sources.length);
      }
      this.ambient = createAudioPlayer(this.sources[this.variantIdx]);
      this.ambient.loop = true;
      // Start silent so startAmbient() can fade in and avoid a click.
      this.ambient.volume = 0;
      this.attachStatus(this.ambient);
    }
  }

  /**
   * Listen to a player's status: drive the position-based variant crossfade, and
   * mirror external (lock-screen) play/pause back to the session UI. Re-attached
   * to the incoming player on each crossfade, so the "current" player is always
   * the one we watch. The transient pause/play of a swap is ignored (evolving).
   */
  private attachStatus(player: AudioPlayer) {
    try {
      this.statusSub?.remove();
    } catch {
      // ignore
    }
    this.statusSub = player.addListener('playbackStatusUpdate', (status) => {
      // Cycle near the track's natural end (after a minimum dwell), not mid-track.
      this.maybeCycle(status.currentTime ?? 0, status.duration ?? 0);
      if (this.evolving) return;
      const playing = !!status.playing;
      if (this.lastPlaying === playing) return;
      this.lastPlaying = playing;
      if (this.emitStatus) this.onPlaying?.(playing);
    });
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
        if (this.playing && !this.evolving && Date.now() - this.dwellStart >= this.dwell.max) void this.evolve();
      }, 15000);
    }
  }

  /** Decide, from the current playback position, whether to cycle to the next
   *  variant — triggering only near the track's end so it isn't cut off. */
  private maybeCycle(currentTime: number, duration: number) {
    if (this.sources.length < 2 || !this.playing || this.evolving) return;
    if (Date.now() - this.dwellStart < this.dwell.min) return;
    if (duration > 0 && currentTime >= duration - END_LEAD_SEC) void this.evolve();
  }

  /**
   * Crossfade to the next variant with a true two-player mixer: the incoming
   * track starts silently and both players ramp past each other simultaneously,
   * so there's no gap of silence between tracks (the old approach faded fully out
   * before swapping). The incoming player becomes the current one; the outgoing
   * is retired once the fade completes.
   */
  private async evolve() {
    const outgoing = this.ambient;
    if (!outgoing || this.evolving || !this.playing || this.sources.length < 2) return;
    this.evolving = true;
    let incoming: AudioPlayer | null = null;
    try {
      const next = (this.variantIdx + 1) % this.sources.length;
      incoming = createAudioPlayer(this.sources[next]);
      incoming.loop = true;
      incoming.volume = 0;
      incoming.play();
      // The incoming track is now the current player: watch its status and move
      // the lock-screen controls onto it (they die with the outgoing player).
      this.attachStatus(incoming);
      this.ambient = incoming;
      this.variantIdx = next;
      this.dwellStart = Date.now();
      if (!this.mixWithMusic) {
        try {
          incoming.setActiveForLockScreen(
            true,
            { title: this.lockTitle ?? 'Stillness', artist: 'Stillness', artworkUrl: this.artwork },
            { isLiveStream: true, showSeekForward: false, showSeekBackward: false },
          );
        } catch {
          // Lock-screen controls are a bonus; ignore if unavailable.
        }
      }
      // Overlapping crossfade — the heart of the mixer.
      await Promise.all([
        this.ramp(outgoing, outgoing.volume ?? this.targetVol, 0, XFADE_MS),
        this.ramp(incoming, 0, this.targetVol, XFADE_MS),
      ]);
    } catch {
      // Best effort — never let an evolve break playback.
    } finally {
      if (this.ambient === incoming && incoming) {
        // Swap completed: retire the outgoing player now that it's silent.
        try {
          outgoing.clearLockScreenControls();
        } catch {
          // ignore
        }
        try {
          outgoing.pause();
        } catch {
          // ignore
        }
        try {
          outgoing.remove();
        } catch {
          // ignore
        }
        // If the user paused during the crossfade, honour it on the new player.
        if (!this.playing) {
          try {
            this.ambient?.pause();
          } catch {
            // ignore
          }
        }
      } else if (incoming) {
        // Swap failed before completing — discard the half-made incoming player
        // and keep the outgoing one as current so playback never drops out.
        try {
          incoming.remove();
        } catch {
          // ignore
        }
      }
      this.evolving = false;
    }
  }

  /** Ramp a specific player's volume from `from` to `to` over `ms`. */
  private async ramp(player: AudioPlayer | null, from: number, to: number, ms: number) {
    if (!player) return;
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      try {
        player.volume = from + (to - from) * (i / steps);
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
