---
id: 9898
title: 'docs: add Core Engine Pipeline cross-references to CodebaseOverview'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T08:36:23Z'
updatedAt: '2026-04-12T08:53:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9898'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T08:53:51Z'
---
# docs: add Core Engine Pipeline cross-references to CodebaseOverview

## Problem

`CodebaseOverview.md` serves as the canonical onboarding document for agents (mandated by `AGENTS_STARTUP.md` Step 1). While it covers the *what* of each subsystem effectively, it provides **zero navigation pointers** to the 6 Core Engine guides in `learn/guides/coreengine/` — the documents that explain the *why* behind Neo's most fundamental compilation→runtime pipeline.

Additionally, `learn/tree.json` — the canonical hierarchical index of all 130+ learning topics — is completely absent from both `CodebaseOverview.md` and `AGENTS_STARTUP.md`, despite being the structural backbone that the Knowledge Base's `LearningSource.mjs` traverses to discover and index all guides.

### The Knowledge Gap

The startup workflow (`AGENTS_STARTUP.md`) requires agents to read `src/Neo.mjs` (1,212 lines, 315 JSDoc lines) and `src/core/Base.mjs` (1,289 lines, 485 JSDoc lines). These source files provide excellent **API surface and implementation mechanics**. However, the Core Engine guides provide critical **architectural reasoning, failure scenarios, and integration patterns** that are not self-evident from reading source code alone:

| Guide | Unique Knowledge Delta (not in source files) |
|-------|----------------------------------------------|
| `WhyEnhance.md` | Explains the native JS `constructor` trap with a concrete failing example — the *motivation* for why `construct()` exists |
| `SetupClass.md` | Visual Mermaid diagrams for config merging flow, `Neo.overwrites` global injection, "Gatekeeper Pattern" for mixed environments |
| `ConfigSystem.md` | `configSymbol` as "Temporary Holding Zone" — pedagogical proof of cross-dependent batch resolution (the `a + b = 10` example) |
| `Reactivity.md` | The v10 architectural bridge: `core.Config` instances backing every reactive config, enabling `EffectManager` to observe *any* config — the **integration point** between Push and Pull tiers |
| `Lifecycle.md` | Remote method registration as `initAsync` primary use case, Main Thread Addon pattern (external script loading + message queuing) |
| `Utilities.md` | `core.Compare` as the "infinite loop breaker" for circular write dependencies, `delayable` as declarative modifier pattern |

### Current State

- CodebaseOverview's "Two-Tier Reactivity" section (L96-124) shows Push/Pull examples but doesn't link to the full guide
- "Key Concepts: Query Entry Points" (L540-549) lists terms like `afterSet`, `configSymbol`, `Effect` but provides no trail to the guide series
- The "Learning Materials" section (L352-361) mentions the guides directory generically but doesn't call out the Core Engine series or `tree.json`
- `AGENTS_STARTUP.md` has zero reference to `learn/tree.json` despite it being the canonical index for all documentation

## Proposed Changes

### 1. CodebaseOverview.md — Core Engine Pipeline Cross-References
Add a "Core Engine Deep Dives" cross-reference block after the existing "Two-Tier Reactivity" section. ~10-15 lines summarizing the 6-step compilation→runtime pipeline with explicit links to each guide.

### 2. CodebaseOverview.md — tree.json in Learning Materials
Expand the Learning Materials section (L352-361) to mention `learn/tree.json` as the canonical hierarchical index of all documentation topics, and note its role as the Knowledge Base's structural backbone.

### 3. AGENTS_STARTUP.md — tree.json as orientation tool
Add a pointer to `learn/tree.json` in the startup workflow so agents can scan the full documentation taxonomy before deep-diving.

## Scope Boundary

- Documentation-only. No code changes.
- Files modified: `learn/guides/fundamentals/CodebaseOverview.md`, `AGENTS_STARTUP.md`
- Does not overlap with #9892 (Agent OS internals) or #9893 (ask_knowledge_base promotion)

## Architectural Context

- `learn/guides/coreengine/` — 6 files, ~36k bytes total
- `learn/tree.json` — 159 lines, canonical index for all learn/ content, consumed by `LearningSource.mjs`
- `AGENTS_STARTUP.md` Steps 2-3 — mandate reading `src/Neo.mjs` and `src/core/Base.mjs`
- `CodebaseOverview.md` — currently 636 lines, ~30.5k bytes

## Attribution

Analysis and implementation by **Antigravity (Claude Opus 4.6)**.

## Timeline

- 2026-04-12T08:36:25Z @tobiu assigned to @tobiu
- 2026-04-12T08:36:25Z @tobiu added the `documentation` label
- 2026-04-12T08:36:25Z @tobiu added the `enhancement` label
- 2026-04-12T08:36:25Z @tobiu added the `ai` label
- 2026-04-12T08:43:38Z @tobiu referenced in commit `fd3f43c` - "docs: add Core Engine Pipeline cross-references and tree.json pointers (#9898)"
- 2026-04-12T08:44:05Z @tobiu cross-referenced by PR #9899
- 2026-04-12T08:53:51Z @tobiu referenced in commit `486e865` - "docs: add Core Engine Pipeline cross-references and tree.json pointers (#9898) (#9899)"
- 2026-04-12T08:53:51Z @tobiu closed this issue
- 2026-04-12T09:02:03Z @tobiu cross-referenced by #9900

