---
id: 9890
title: 'feat: DreamService 4th REM Vector — executeNLActionDigest()'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-11T19:22:38Z'
updatedAt: '2026-06-22T12:54:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9890'
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
blockedBy:
  - '[x] 9913 fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis'
  - '[x] 9889 feat: Implement NL Action Recorder — log Neural Link tool calls to nl_action_log'
blocking: []
closedAt: '2026-06-22T12:54:31Z'
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
- 2026-04-12T11:40:05Z @tobiu marked this issue as being blocked by #9913
- 2026-05-26T00:29:34Z @neo-opus-ada cross-referenced by #12007
- 2026-06-06T03:50:57Z @neo-gpt cross-referenced by #9906
- 2026-06-06T13:57:40Z @neo-gpt cross-referenced by #9905
- 2026-06-06T13:57:41Z @neo-gpt cross-referenced by #9907
- 2026-06-06T15:04:17Z @neo-gpt cross-referenced by #9904
- 2026-06-06T15:13:14Z @neo-gpt cross-referenced by PR #12638
- 2026-06-22T00:29:09Z @neo-gpt assigned to @neo-gpt
- 2026-06-22T00:29:09Z @neo-gpt unassigned from @tobiu
### @neo-gpt - 2026-06-22T00:29:10Z

**`[lane-override]` reassignment audit-trail** (#11537 §AC8)

**Previous assignees:** `@tobiu`
**New assignees:** `@me`
**Reason:** Operator @tobiu explicitly allowed agents to pick up tickets assigned to him in the active Agent OS repair window. Intake verified #9890's blockers #9889 and #9913 are completed and #9906's TEST->VALIDATES contract has landed; @neo-gpt is claiming the narrowed weak-evidence NL action digest lane without treating NL action success as permanent Playwright coverage.

*Audit-trail per AGENTS.md §6.5 — `acknowledgedReassign` reason persistence. Graph-ingested via Retrospective daemon comment-scan path.*

- 2026-06-22T00:54:30Z @neo-gpt cross-referenced by PR #13841
- 2026-06-22T01:38:04Z @neo-gpt referenced in commit `14d4d01` - "feat(ai): digest Neural Link action evidence (#9890)"
- 2026-06-22T01:38:04Z @neo-gpt referenced in commit `42e2650` - "fix(ai): tighten NL action digest evidence (#9890)"
- 2026-06-22T02:00:27Z @neo-gpt referenced in commit `8ab3ccc` - "feat(ai): digest Neural Link action evidence (#9890)"
- 2026-06-22T02:00:27Z @neo-gpt referenced in commit `4bdf25a` - "fix(ai): tighten NL action digest evidence (#9890)"
- 2026-06-22T02:00:27Z @neo-gpt referenced in commit `2b48d58` - "fix(ai): gate NL action digest read tools (#9890)"
- 2026-06-22T12:54:31Z @tobiu referenced in commit `93c8c36` - "feat(ai): digest Neural Link action evidence (#9890) (#13841)

* feat(ai): digest Neural Link action evidence (#9890)

* fix(ai): tighten NL action digest evidence (#9890)

* fix(ai): gate NL action digest read tools (#9890)"
- 2026-06-22T12:54:31Z @tobiu closed this issue

