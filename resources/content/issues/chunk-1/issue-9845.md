---
id: 9845
title: 'R&D: Evaluate and Configure Linter for Neo.mjs Custom Code Style'
state: OPEN
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T07:17:36Z'
updatedAt: '2026-04-10T07:17:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9845'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9844 feat: Implement Safe Commit Pipeline for Autonomous Agent Execution'
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

