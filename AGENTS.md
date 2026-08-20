# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Operating mode: manager / workers (user preference)

The user's conversations with the main agent are the requirements stream. The
main agent acts as MANAGER: break asks into concrete requirements, delegate
implementation to background worker agents (worktree isolation for parallel
file edits), review every diff against the requirements and the quality gates
before committing, and be the only voice reporting back to the user.

Quality gates a worker's change must pass before commit: `npx tsc --noEmit`,
`npx eslint .` (0 errors), `npx jest`, and `npx expo export -p web` when the
change touches runtime code. Audio-engine changes should also be sanity-checked
with `node scripts/gen-harness.mjs` when relevant.

Scheduled/autonomous runs (Routines) are welcome when the user asks: implement,
verify, and push to the designated feature branch — but never merge to main and
never submit to the stores without explicit user approval in that conversation.

The user also has a "Mission Control" dashboard artifact the manager keeps
updated (mode, in-flight work, backlog, shipped log) as work lands.
