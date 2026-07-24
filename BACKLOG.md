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

(empty — the worker backlog is done; add items here and the nightly routine
will pick them up)

## Blocked on the user (do NOT take these autonomously)

- Sentry crash reporting (needs DSN + privacy-declaration decision)
- Gemini music license confirmation (user must check the tool's terms)
- Store account wiring (eas init, credentials, screenshots)
- Device checks: crossfade mixer listen, production build smoke test

## Shipped

- 2026-07-19 · (see git log) · **Compiler warnings** (run #3b): four rule
  downgrades removed from eslint.config.js; render purity fixed on the session
  screen; 19 -> 10 warnings, new violations now fail CI.
- 2026-07-19 · (see git log) · **Test expansion** (run #3a): +28 tests (60
  total) — storage migration, foldLoop DSP extracted pure + tested, dwell
  bounds.

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
