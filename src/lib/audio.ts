/**
 * Thin imperative wrapper around expo-audio for the meditation session:
 * a looping ambient bed.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

import type { AmbientSound, FileSound } from './types';
import { isGenerative } from './types';

const AMBIENT_SOURCES: Record<FileSound, number> = {
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
  lofi: require('@/assets/audio/beats/lofi.wav'),
  liquid: require('@/assets/audio/beats/liquid.wav'),
  chillstep: require('@/assets/audio/beats/chillstep.wav'),
  downtempo: require('@/assets/audio/beats/downtempo.wav'),
  deephouse: require('@/assets/audio/beats/deephouse.wav'),
  melodic: require('@/assets/audio/beats/melodic.wav'),
  techno: require('@/assets/audio/beats/techno.wav'),
  triphop: require('@/assets/audio/beats/triphop.wav'),
  synthwave: require('@/assets/audio/beats/synthwave.wav'),
};

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
    await ensureAudioMode(mixWithMusic);
    if (ambient !== 'none' && !isGenerative(ambient)) {
      this.ambient = createAudioPlayer(AMBIENT_SOURCES[ambient]);
      this.ambient.loop = true;
      // Start silent so startAmbient() can fade in and avoid a click.
      this.ambient.volume = 0;
    }
  }

  /** Start the loop and fade it in so it doesn't pop on the first sample. */
  startAmbient() {
    const player = this.ambient;
    if (!player) return;
    player.play();
    // Show lock-screen / control-center playback info, but only when we own the
    // audio session (the API requires it). Best-effort: never let it break audio.
    if (!this.mixWithMusic) {
      try {
        player.setActiveForLockScreen(
          true,
          { title: this.lockTitle ?? 'Stillness', artist: 'Stillness' },
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
  }

  /** Pause the loop (keeps position), e.g. when the session is paused. */
  pauseAmbient() {
    try {
      this.ambient?.pause();
    } catch {
      // ignore
    }
  }

  /** Resume after pauseAmbient(). */
  resumeAmbient() {
    try {
      this.ambient?.play();
    } catch {
      // ignore
    }
  }

  /** Fade ambient out over a few hundred ms, then pause. */
  async stopAmbient() {
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
    try {
      this.ambient?.clearLockScreenControls();
    } catch {}
    try {
      this.ambient?.remove();
    } catch {}
    this.ambient = null;
  }
}
