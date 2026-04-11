---
id: 9890
title: 'feat: DreamService 4th REM Vector — executeNLActionDigest()'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T19:22:38Z'
updatedAt: '2026-04-11T19:23:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9890'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9889 feat: Implement NL Action Recorder — log Neural Link tool calls to nl_action_log'
blocking: []
---
# feat: DreamService 4th REM Vector — executeNLActionDigest()

## Context

The `DreamService` REM pipeline (`processUndigestedSessions()`) currently executes 3 extraction vectors per undigested session:

1. **Tri-Vector Extraction** (`executeTriVectorExtraction`) — LLM-powered graph node/edge extraction from episodic memory
2. **Topological Conflicts** (`extractTopology`) — LLM-powered conflict detection (SUPERSEDES, OBSOLETES, DUPLICATE) → `sandman_handoff.md`
3. **Capability Gap Inference** (`executeCapabilityGapInference`) — Deterministic + LLM hybrid gap detection (DOC_GAP, TEST_GAP, GUIDE_GAP)

This ticket adds the **4th vector**: `executeNLActionDigest()`, which reads successful Neural Link action sequences from the `nl_action_log` table (created by #9889) and uses them to **close TEST_GAPs** on graph nodes that have been verified through live agent interaction.

## A2A Context (Fat Ticket)

### Architectural Position

The 4th vector slots into `processUndigestedSessions()` after `executeCapabilityGapInference()` (line ~197) and before `runGarbageCollection()` (line ~211). It follows the exact same pattern as the existing three vectors:

1. Accept session context
2. Query a data source (`nl_action_log` via `better-sqlite3` handle on `memory-core.sqlite`)
3. Perform deterministic analysis (group by `sequence_id`, calculate success rate per component class)
4. Upsert results into GraphService (TEST nodes with VALIDATES edges)

### Key Design Decisions

- **No Playwright scaffold synthesis in this ticket.** The immediate value is closing TEST_GAPs automatically. Playwright synthesis is a follow-up concern.
- **Success rate threshold.** Only sequences where ≥80% of tool calls returned `success: true` should qualify as "verified interactions."
- **Component class extraction.** The `nl_action_log.args` JSON contains `componentId` and `className` fields from NL tool calls. These map directly to graph nodes of type `CLASS`.
- **Gap closure mechanism.** When a CLASS node has `[TEST_GAP]` in its `capabilityGap` property AND `nl_action_log` contains successful sequences targeting that class, the gap severity should be downgraded (not fully removed — agent interaction is weaker evidence than a permanent Playwright test).

### Prerequisite

- #9889 (NL Action Recorder) must be merged first — the `nl_action_log` table must exist.

### Files to Modify

| File | Change |
|------|--------|
| `ai/daemons/DreamService.mjs` | Add `executeNLActionDigest(session)` method; call it from `processUndigestedSessions()` |

### Avoided Pitfalls

- The `nl_action_log` SQLite handle must use the same WAL-mode connection pattern as `DatabaseService.mjs` to avoid SQLITE_BUSY contention during concurrent swarm operations.
- Do NOT attempt to embed NL action sequences as vectors — they are structured relational data, not semantic text. Keep them in the SQL domain.

## Verification Plan

1. Unit test following the `DreamService.spec.mjs` pattern (isolated tmp/ SQLite DB)
2. Mock `nl_action_log` with synthetic successful + failed sequences
3. Assert that TEST_GAP severity on corresponding graph nodes is downgraded after digest execution


## Timeline

- 2026-04-11T19:22:39Z @tobiu added the `enhancement` label
- 2026-04-11T19:22:39Z @tobiu added the `ai` label
- 2026-04-11T19:23:12Z @tobiu assigned to @tobiu
- 2026-04-11T19:23:12Z @tobiu marked this issue as being blocked by #9889

