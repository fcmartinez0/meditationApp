# Stillness — a meditation app for iOS & Android

A calming cross-platform meditation app built with **Expo (React Native + TypeScript)**.
A single codebase runs on both iOS and Android.

## Features

- **Meditation timer** — pick a length (3–30 min), choose a background sound, and
  follow a breathing orb. Optional start / end / interval bells.
- **Focus & calm music** — procedurally generated binaural-beat tracks tuned to
  brainwave-entrainment frequencies (see below).
- **Beats** — a set of synthesized instrumental grooves, each modeled on a
  recognizable artist style (see _Beats_ below). 44.1 kHz, mastered, with
  reverb, sidechain and phrase-ending fills.
- **Generative music** — endless, never-repeating ambient/groove composed live
  in the Web Audio API (evolving chords, sub-bass, arpeggio, soft percussion,
  chimes and convolution reverb). **Like or rate** a piece and it **learns your
  taste** per section; see what it's learned in Settings.
- **Ambient sounds** — rain, ocean, forest, a babbling stream, a campfire,
  night crickets, brown noise, a ~25 Hz cat purr, plus pure silence.
- **Adaptive UI** — an Apple-Music/Spotify-style picker whose accent color
  follows the selected sound's category, all the way into the session.
- **Streaks & progress** — daily streak, longest streak, total time and sessions,
  and a weekly minutes chart. All stored locally on device.
- **Daily reminders** — an optional local notification at a time you choose.

## Frequency music

The frequency tracks are synthesized as **binaural beats**: each ear hears a
carrier tone offset by the beat frequency, so the listener perceives a pulse at
that difference. Frequencies were chosen from common brainwave-entrainment
associations (see _Sources_):

| Track   | Beat        | Carrier            | Intended state                                   |
| ------- | ----------- | ------------------ | ------------------------------------------------ |
| Calm    | **7.83 Hz** | 216 Hz (432-tuned) | Schumann resonance, theta/alpha — grounding calm |
| Clarity | **10 Hz**   | 240 Hz             | Alpha — relaxed, clear presence                  |
| Focus   | **14 Hz**   | 256 Hz             | Low-beta / SMR — alert, relaxed concentration    |
| Dream   | **6 Hz**    | 198 Hz             | Theta — dreamy and meditative                    |
| Deep    | **3 Hz**    | 144 Hz             | Delta — deep rest and sleep                      |

> Binaural beats require **headphones** and are offered as a wellness aid, not a
> medical treatment. Scientific evidence for cognitive effects is mixed, and any
> benefit may come from the calming music itself as much as the specific beat.

## Beats

Four synthesized instrumental loops (drums, bass, chords and textures built from
oscillators and filtered noise), each modeled on the signature style of an
artist — an homage, not a sample of their work:

| Track        | Tempo   | Style                                | Modeled on         |
| ------------ | ------- | ------------------------------------ | ------------------ |
| Melodic House | 123 BPM | euphoric melodic house (sidechain pump, dotted-eighth delays, filter build, reverb wash) | RÜFÜS DU SOL       |
| Deep House   | 122 BPM | dark, sultry, spacious deep house    | ZHU                |
| Ambient Techno | 122 BPM | hypnotic, deep, rolling minimal techno | Jon Hopkins       |
| Lo-Fi        | 85 BPM  | jazzy, dusty lo-fi hip-hop           | Nujabes / J Dilla  |
| Liquid       | 172 BPM | lush, rolling liquid drum & bass     | LTJ Bukem / Netsky |
| Chillstep    | 140 BPM | smoky 2-step / future garage         | Burial             |
| Downtempo    | 98 BPM  | dreamy, ping-pong arps               | Tycho / Bonobo     |

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

### Cloud builds & store submission (EAS)

`eas.json` defines `development`, `preview`, and `production` profiles, and the
bundle identifier is `com.fcmartinez0.stillness` (iOS & Android). No Mac
required:

```bash
npm i -g eas-cli && eas login
eas build -p ios --profile preview     # installable build via link
eas submit -p ios                       # TestFlight / App Store (needs an Apple Developer account)
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

## Privacy & security

- **Local-first, no backend.** There is no account and no server. Settings,
  streak, session history and learned music preferences live only on the
  device (AsyncStorage). Nothing is transmitted; there is no tracking,
  advertising or analytics.
- **Notifications** are local-only (scheduled on-device).
- **In-app disclosure.** A Privacy & Disclaimer screen (Settings → About)
  covers the data model and the wellness/non-medical disclaimer.
- **Web hardening.** The web build ships a Content-Security-Policy and a
  referrer policy via `src/app/+html.tsx`. Header-only protections (HSTS,
  `X-Frame-Options`, `X-Content-Type-Options`) require a host that can set
  headers — GitHub Pages can't, so put a CDN (e.g. Cloudflare Pages) in front
  to add those and to tighten the CSP once verified.
- **Supply chain.** CI runs type-check, tests and **gitleaks** secret-scanning
  on every push/PR; **Dependabot** proposes weekly dependency updates. No API
  keys or secrets are stored in the app — if a backend/AI feature is added
  later, proxy it server-side and never embed keys client-side.

## Audio size & compression

Audio is shipped as uncompressed 44.1 kHz WAV (~52 MB total, fetched per-track
on the web so initial load is small). Lossy compression (MP3/AAC/OGG) is **not**
used because those formats add encoder/decoder padding that the Web Audio
`decodeAudioData` path doesn't trim, which would reintroduce a gap at the
seamless loop point. A gapless-aware pipeline (or native-only compressed
playback) is the path to shrinking this.

## Sources

Frequency choices are informed by general brainwave-entrainment and
sound-healing references:

- [What Are the Different Brainwave Frequencies? Delta to Gamma](https://jaapi.media/blogs/insights/what-are-the-different-brainwave-frequencies)
- [Binaural Beats Frequency Guide: Which Hz for Sleep, Focus & Meditation](https://mysticryst.com/blogs/the-mystic-journal/binaural-beats-frequency-guide-hz-sleep-focus-meditation)
- [Personalized Theta and Beta Binaural Beats for Brain Entrainment (NIH/PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8636003/)
- [How to Use the Schumann Resonance in Meditation: 7.83 Hz Grounding](https://jaapi.media/blogs/insights/how-to-use-schumann-resonance-in-meditation)
- [The Science Behind Solfeggio Frequencies (432 Hz / 528 Hz)](https://www.bettersleep.com/blog/science-behind-solfeggio-frequencies)
