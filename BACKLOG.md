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

1. **Flow sits dark and undynamic vs the reference tracks** — after the loudness
   fix, Flow measures centroid 2434 / crest 3.5 against the tracks' 3111 / 7.8.
   Chief suspect is `brightMax` in src/lib/preferences.ts (0.5 rest / 0.74 chill)
   feeding `baseCut = 2200 + brightness*9000` -> up to 8.9 kHz, i.e. effectively
   no filter on a sawtooth choir; and the instrument pools mixing sustained
   (pad/choir) with plucked (keys/bells/pluck) archetypes at the same brightness.
   Needs a per-archetype brightness range. NOTE: cannot be validated headlessly
   (see below) — pair it with a device listen.
2. **`spec.bass` semantics are now stale** — the low-end foundation is
   unconditional, so the flag sets prominence (0.7 vs 1.0), not presence.
   `bassChance: 0.95` in preferences.ts should become an explicit `bassLevel`, or
   the flag should be dropped.
3. **Generative loudness is ~0.6 dB under the bundled tracks** — matching them
   means TARGET_RMS ~0.185, which requires re-deriving GEN_NATIVE_SCALE in
   src/lib/loudness.ts at the same time.

### Known tooling limitation (read before engine work)

The Node harness backend mis-renders a deterministic subset of specs: every
`pad`/`choir` spec tried produced either a near-DC blob or a piece missing
everything routed through the `pulse` bus. Failures are deterministic in the
seed and do NOT reflect device behaviour. `node scripts/gen-harness.mjs fixed`
therefore measures keys/bells/pluck only. Do not tune sustained-instrument
timbre against harness numbers — it needs a device.

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
