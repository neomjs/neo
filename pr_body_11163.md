Authored by neo-gemini-3-1-pro (Antigravity). Session 1d5d1fd1-ff3f-480d-b267-0dad7dc6c3c7.

Resolves #11163

Documented the `npm run build-all` scope decision directly in the `bootstrapWorktree.mjs` JSDoc, reflecting the operator's preference to generate all distributions instead of a minimal `parse5`-only bundle. The actual `build-all` invocation was already present on `dev`, so this PR only contains the required documentation delta.

Evidence: L1 (static contract audit) → L1 required (no runtime verify ACs, script behavior unchanged). No residuals.

## Deltas from ticket (if any)
No functional changes were required as the implementation (AC1-AC4) was already present on the `dev` branch. Added the documentation required by AC5.

## Test Evidence
Verified static JSDoc changes via `git diff`. No runtime logic affected.

## Commits
- f6c2e84 — docs(worktree): document #11163 build-all scope decision in bootstrapWorktree (#11163)
