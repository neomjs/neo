---
id: 9845
title: 'R&D: Evaluate and Configure Linter for Neo.mjs Custom Code Style'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T07:17:36Z'
updatedAt: '2026-06-23T04:14:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9845'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking:
  - '[ ] 9844 feat: Implement Safe Commit Pipeline for Autonomous Agent Execution'
closedAt: '2026-06-23T04:14:22Z'
---
# R&D: Evaluate and Configure Linter for Neo.mjs Custom Code Style

## Problem (A2A Context — Claude Opus 4.6 via Antigravity)

Neo.mjs uses a distinctive custom code formatting style that is well-defined in `AGENTS.md` §12 and visible throughout the codebase:
- Aligned assignment operators (`=` in config blocks)
- Space-inside-brackets for imports/destructuring
- Fat arrow shorthand preference
- Optional chaining enforcement (`?.` over `&&` chains)
- Object property shorthand

This style is currently enforced solely via human review and AI agent training (system prompts). There is no automated linting infrastructure. As agent-driven commits increase (see #9844 CommitGate), a machine-enforceable style gate becomes critical — without it, agents can introduce formatting drift that degrades codebase consistency.

## R&D Scope

This is a **research and design** ticket, not an implementation ticket. The deliverable is an analysis document and a proof-of-concept ESLint/Biome configuration.

### Research Questions

1. **Tool Selection:** ESLint (mature, extensible, plugins for JSDoc validation) vs Biome (fast, zero-config, but less customizable for niche rules). Which can express Neo.mjs's custom alignment style?

2. **Custom Rules Required:** The aligned assignment style (`className: '...',` with aligned colons) may require a custom ESLint plugin. Can this be expressed as a rule, or does it require a Prettier plugin?

3. **JSDoc Enforcement:** Can the chosen tool enforce:
   - `@summary` on all public methods
   - `@member` on all config properties
   - `@protected` on lifecycle methods
   - `@returns` on non-void methods

4. **Integration Surface:**
   - Pre-commit hook via Husky/lint-staged
   - `npm run lint` script
   - CommitGate integration (#9844): plugs into the validation gates array
   - CI pipeline (GitHub Actions)

5. **Incremental Adoption:** With 5000+ source files, a full-codebase lint pass would generate thousands of violations. Strategy for gradual enforcement (new files only → modified files → full codebase).

### Deliverables

- Analysis document: `resources/content/research/linter-analysis.md`
- Proof-of-concept config: `.eslintrc.mjs` or `biome.json` (whichever wins)
- Test run output on 3 representative files: `src/core/Base.mjs`, `ai/Agent.mjs`, `src/component/Button.mjs`

## Architectural Context

- `AGENTS.md` §12: Coding Syntax Constraints (ES6+) — the canonical style rules
- `src/core/Base.mjs`: The canonical reference file for Neo.mjs code style
- `ai/agent/CommitGate.mjs` (#9844): Future integration point for the linter as a pre-commit gate

## Avoided Pitfalls

- Do NOT auto-fix the entire codebase in one commit — formatting changes in thousands of files would make `git blame` useless
- Do NOT choose a tool that can't handle the aligned-assignment style — this is a hard requirement
- Do NOT enforce trailing comma rules that conflict with the existing style (Neo.mjs uses trailing commas inconsistently)

## Verification

- Proof-of-concept lints 3 files without false positives on Neo.mjs's intentional style choices
- Document captures trade-offs and recommendation for final tool selection

## Timeline

- 2026-04-10T07:17:37Z @tobiu added the `enhancement` label
- 2026-04-10T07:17:37Z @tobiu added the `developer-experience` label
- 2026-04-10T07:17:38Z @tobiu added the `ai` label
- 2026-04-10T07:17:50Z @tobiu assigned to @tobiu
- 2026-04-10T07:18:01Z @tobiu marked this issue as blocking #9844
- 2026-06-21T20:19:09Z @neo-opus-ada cross-referenced by #13813
### @neo-gpt - 2026-06-23T04:14:21Z

## Resolved by successor lint-tooling chain

Live checks performed before this close:

- #9845's original premise said Neo had no automated linting infrastructure and needed an ESLint/Biome/Prettier R&D pass.
- The later formatter/lint chain answered that question with a Neo-native `buildScripts/util/check-block-alignment.mjs` path instead of Prettier or stock ESLint/Biome. The key decision is captured on #13556: Prettier was rejected because it de-aligns Neo's house style; ESLint `key-spacing` alone could not cover import-`from` or declaration-block alignment; the repo-local `check-*` lint family was the right substrate.
- #13556 is closed, and PR #13558 shipped the initial block-alignment lint + `--fix`.
- PR #13564 extended it to object-literal colons and declaration blocks.
- PR #13676 guarded template literals.
- #13720 / PR #13721 diff-scoped the pre-commit path to staged-added lines.
- #13896 / PR #13897 closed the same-line declaration drift that surfaced in later operator review.
- `package.json` now exposes `npm run agent-preflight`, and lint-staged runs the current lint family (`check-whitespace`, `check-shorthand`, `check-jsdoc-types`, `check-ticket-archaeology`, `check-block-alignment --staged`, plus AiConfig mutation checks for tests).

Verdict: #9845 is no longer a live R&D ticket. The broad tool-selection question has graduated into shipped repo-native lint tooling, and the original "no automated linting infrastructure" premise is false on current `dev`.

Closing as completed by the successor chain. Residual formatter gaps should continue as narrow follow-ups against the existing `check-block-alignment` contract, like #13896 did, not by reopening this broad April R&D ticket.

- 2026-06-23T04:14:22Z @neo-gpt closed this issue

