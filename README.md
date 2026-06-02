# Stillness — a meditation app for iOS & Android

A calming cross-platform meditation app built with **Expo (React Native + TypeScript)**.
A single codebase runs on both iOS and Android.

## Features

- **Meditation timer** — pick a length (3–30 min), choose a background sound, and
  follow a breathing orb. Optional start / end / interval bells.
- **Focus & calm music** — procedurally generated binaural-beat tracks tuned to
  brainwave-entrainment frequencies (see below).
- **Ambient sounds** — rain, ocean, and forest beds, plus pure silence.
- **Streaks & progress** — daily streak, longest streak, total time and sessions,
  and a weekly minutes chart. All stored locally on device.
- **Daily reminders** — an optional local notification at a time you choose.

## Frequency music

The three music tracks are synthesized as **binaural beats**: each ear hears a
carrier tone offset by the beat frequency, so the listener perceives a pulse at
that difference. Frequencies were chosen from common brainwave-entrainment
associations (see _Sources_):

| Track  | Beat        | Carrier            | Intended state                                   |
| ------ | ----------- | ------------------ | ------------------------------------------------ |
| Calm   | **7.83 Hz** | 216 Hz (432-tuned) | Schumann resonance, theta/alpha — grounding calm |
| Focus  | **14 Hz**   | 256 Hz             | Low-beta / SMR — alert, relaxed concentration    |
| Deep   | **3 Hz**    | 144 Hz             | Delta — deep rest and sleep                      |

> Binaural beats require **headphones** and are offered as a wellness aid, not a
> medical treatment. Scientific evidence for cognitive effects is mixed, and any
> benefit may come from the calming music itself as much as the specific beat.

All audio is generated procedurally — no third-party assets — so it is fully
reproducible:

```bash
node scripts/generate-audio.js
```

This writes the bell, ambient loops, and stereo binaural music into
`assets/audio/`.

## Getting started

```bash
npm install
npx expo start         # then press i (iOS), a (Android), or scan the QR code
```

You'll need the [Expo Go](https://expo.dev/go) app or a development build. For
notifications and reliable background audio, a development build is recommended:

```bash
npx expo run:ios
npx expo run:android
```

## Project structure

```
src/
  app/                     # expo-router routes
    _layout.tsx            # root stack (tabs + full-screen session modal)
    (tabs)/
      index.tsx            # Meditate — timer setup
      progress.tsx         # Streaks & progress
      settings.tsx         # Reminders, bells, data
    session.tsx            # active session (timer, orb, bells, ambient)
  components/              # Screen, Card, Button, AppText, BreathingOrb
  lib/                     # audio, notifications, storage, stats, dates, types
  store/AppData.tsx        # settings + history context (AsyncStorage-backed)
  theme/                   # colors, spacing, type scale
scripts/generate-audio.js  # procedural audio generator
```

## Sources

Frequency choices are informed by general brainwave-entrainment and
sound-healing references:

- [What Are the Different Brainwave Frequencies? Delta to Gamma](https://jaapi.media/blogs/insights/what-are-the-different-brainwave-frequencies)
- [Binaural Beats Frequency Guide: Which Hz for Sleep, Focus & Meditation](https://mysticryst.com/blogs/the-mystic-journal/binaural-beats-frequency-guide-hz-sleep-focus-meditation)
- [Personalized Theta and Beta Binaural Beats for Brain Entrainment (NIH/PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8636003/)
- [How to Use the Schumann Resonance in Meditation: 7.83 Hz Grounding](https://jaapi.media/blogs/insights/how-to-use-schumann-resonance-in-meditation)
- [The Science Behind Solfeggio Frequencies (432 Hz / 528 Hz)](https://www.bettersleep.com/blog/science-behind-solfeggio-frequencies)
