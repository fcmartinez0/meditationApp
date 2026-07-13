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

1. **Audio interruption recovery** — generative sessions stay silent after a
   phone call/Siri; the engine never observes audio interruptions
   (react-native-audio-api AudioManager interruption events). Wire the
   observer, suspend/resume the context and loop cleanly, and mirror state to
   the session UI. Device verification will be needed; implement defensively.
2. **Animation load on low-end Android** — StarField (70–120 per-star infinite
   Reanimated loops) + BreathingOrb (~70 views, 5 loops) run 100+ concurrent
   UI-thread animations for whole sessions. Drive twinkles from 3–4 shared
   phase values, cap default counts, pause the backdrop when unfocused.
   Preserve the look (subtle, calm); respect reduced motion (already handled).
3. **Volume normalization across audio paths** — file-audio scales user volume
   ×0.6, web generative ×0.5, native generative applies raw setting (default
   0.85) over a normalized render. Define one loudness policy/helper so
   switching sound types is volume-neutral at the same slider position.
4. **Test expansion** — storage migration tests (settingsVersion < 3, recents
   sanitization), extract foldLoop's DSP into a testable pure function with
   tests, SessionAudio dwell/cycle logic with a fake player.
5. **`(tabs)/index.tsx` + session screen React-Compiler warnings** — resolve
   the react-hooks purity/refs warnings properly (they're set to warn in
   eslint.config.js; fixing them makes the compiler's optimizations safe).

## Blocked on the user (do NOT take these autonomously)

- Sentry crash reporting (needs DSN + privacy-declaration decision)
- Gemini music license confirmation (user must check the tool's terms)
- Store account wiring (eas init, credentials, screenshots)
- Device checks: crossfade mixer listen, production build smoke test

## Shipped

- (moved here by runs; see git log on the feature branch for the full history)
