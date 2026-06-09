/**
 * Thin imperative wrapper around expo-audio for the meditation session:
 * a one-shot bell and a looping ambient bed.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

import type { AmbientSound, FileSound } from './types';
import { isGenerative } from './types';

const BELL_SOURCE = require('@/assets/audio/bell.wav');

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
};

let configured = false;

async function ensureAudioMode() {
  if (configured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      // Keep playing when the screen locks mid-session (matches the app's
      // background-audio capability), so meditation isn't cut off.
      shouldPlayInBackground: true,
      interruptionMode: 'mixWithOthers',
    });
    configured = true;
  } catch {
    // Non-fatal: audio mode just falls back to platform defaults.
  }
}

export class SessionAudio {
  private bell: AudioPlayer | null = null;
  private ambient: AudioPlayer | null = null;
  private targetVol = 0.6;

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

  async prepare(ambient: AmbientSound) {
    await ensureAudioMode();
    if (!this.bell) {
      this.bell = createAudioPlayer(BELL_SOURCE);
    }
    if (ambient !== 'none' && !isGenerative(ambient)) {
      this.ambient = createAudioPlayer(AMBIENT_SOURCES[ambient]);
      this.ambient.loop = true;
      // Start silent so startAmbient() can fade in and avoid a click.
      this.ambient.volume = 0;
    }
  }

  ringBell() {
    if (!this.bell) return;
    try {
      this.bell.seekTo(0);
      this.bell.play();
    } catch {
      // ignore transient playback errors
    }
  }

  /** Start the loop and fade it in so it doesn't pop on the first sample. */
  startAmbient() {
    const player = this.ambient;
    if (!player) return;
    player.play();
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
      this.bell?.remove();
    } catch {}
    try {
      this.ambient?.remove();
    } catch {}
    this.bell = null;
    this.ambient = null;
  }
}
