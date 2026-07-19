# Backlog (ordered — the nightly routine takes the top unblocked item)

Standing rules for autonomous runs (see also AGENTS.md "Operating mode"):
- Implement with worker agents, review the diff as manager, verify against the
  quality gates (`npx tsc --noEmit`, `npx eslint .` 0 errors, `npx jest`,
  `npx expo export -p web` for runtime code; `node scripts/gen-harness.mjs`
  for audio-engine changes).
- Push to `claude/meditation-app-ios-android-j3pS2`. NEVER merge to main.
  NEVER submit to app stores.
- After a run: move the finished item to "Shipped" below, and refresh the
  Mission Control artifact (update via its URL):
  https://claude.ai/code/artifact/d115b082-5da7-4fcc-bff4-605c22154a48

## Ready for workers (take from the top)

1. **Test expansion** — storage migration tests (settingsVersion < 3, recents
   sanitization), extract foldLoop's DSP into a testable pure function with
   tests, SessionAudio dwell/cycle logic with a fake player.
2. **`(tabs)/index.tsx` + session screen React-Compiler warnings** — resolve
   the react-hooks purity/refs warnings properly (they're set to warn in
   eslint.config.js; fixing them makes the compiler's optimizations safe).

## Blocked on the user (do NOT take these autonomously)

- Sentry crash reporting (needs DSN + privacy-declaration decision)
- Gemini music license confirmation (user must check the tool's terms)
- Store account wiring (eas init, credentials, screenshots)
- Device checks: crossfade mixer listen, production build smoke test

## Shipped

- 2026-07-19 · 0371797 · **Animation load** (run #2a): 4 shared twinkle clocks +
  focus pause — ~11 concurrent animations focused, 0 unfocused (was 100+).
  Worth an eyeball on device: twinkle waveform is now a smooth sine.
- 2026-07-19 · 40d8c08 · **Volume normalization** (run #2b): one loudness policy
  (src/lib/loudness.ts); native generative now plays level with the tracks
  (~4 dB quieter at the default slider — intended). Web-gen scale still by-ear.

- 2026-07-14 · ca8fe0d · **Audio interruption recovery** (run #1): generative
  playback now pauses on phone-call/Siri interruptions and resumes when the OS
  allows, with the session UI mirroring the change. Device verification pending
  (call resume; manual resume after shouldResume:false).
- (moved here by runs; see git log on the feature branch for the full history)
