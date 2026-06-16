---
id: 9959
title: 'fix(memory): periodic summarization must skip externally active sessions'
state: CLOSED
labels:
  - bug
  - ai
  - regression
  - architecture
  - performance
  - model-experience
assignees:
  - neo-gpt
createdAt: '2026-04-13T10:25:29Z'
updatedAt: '2026-06-06T17:01:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9959'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9961 Pre-Task Retrospective Query — Active Memory Consumption'
closedAt: '2026-06-06T17:01:18Z'
---
# fix(memory): periodic summarization must skip externally active sessions

## Current Verified State (2026-06-06)

This issue was originally filed for two Memory Core defects:

1. `StorageRouter.injectQueryReRanker()` crashed when ChromaDB query results were empty, malformed, or failed during embedding.
2. `SessionService.findSessionsToSummarize()` selected the current in-process session for summarization when the summary was missing.

Those original defects are already resolved by merged PR #9960 (merged 2026-04-13). Current source confirms:

- `ai/services/memory-core/managers/StorageRouter.mjs` wraps Pass 1 semantic retrieval in `try/catch`, logs fallback, and reads `searchResult?.ids?.[0]`.
- `ai/services/memory-core/SessionService.mjs` excludes `sessionId === this.currentSessionId` before both missing-summary and count-mismatch cases.
- `test/playwright/unit/ai/services/memory-core/QueryReRanker.spec.mjs` covers the defensive re-ranker path and in-process active-session exclusion.

The remaining live bug is narrower: periodic child-process summarization can still select sessions that are active in another harness or MCP process, because the child process has no request-bound session context for those externally active sessions.

## Problem

The orchestrator summary task runs `ai/scripts/lifecycle/summarize-sessions.mjs` as a spawned child process:

- `ai/daemons/orchestrator/TaskDefinitions.mjs` points the `summary` task at `summarize-sessions.mjs`.
- `summarize-sessions.mjs` initializes `Memory_SessionService` in the child process and calls `summarizeSessions({ includeAll: false })`.
- `findSessionsToSummarize()` excludes only `this.currentSessionId`, which resolves to `RequestContextService.getSessionId() || this._legacySessionId`.

In the spawned child path, `this.currentSessionId` is the child process's local legacy/request session, not the session IDs currently accumulating memories in other live harnesses. A periodic sweep can therefore see memory-count drift for an active external session and re-summarize it repeatedly before that session has actually ended.

Impact:

- incomplete mid-flight summaries can be written for still-running sessions;
- LLM summarization tokens are spent on active sessions rather than completed work;
- future agents may retrieve stale or partial summaries while the raw memory stream is still growing.

## Accepted Scope

Define and implement a cross-process active-session predicate for periodic drift-detection summarization.

This ticket is about automatic periodic sweeps. Explicit/manual summarization of a named `sessionId` must remain allowed when deliberately requested.

## Contract Ledger

| Surface | Contract |
| --- | --- |
| `SessionService.findSessionsToSummarize(includeAll = false)` | Must exclude sessions that are active in another harness/process, not only the child process `currentSessionId`. The predicate must be source-backed and testable. |
| `SessionService.summarizeSessions({ includeAll, sessionId })` | Explicit `sessionId` summarization remains intentional and may summarize the active session when the caller names it directly. The cross-process skip applies only to drift-detection candidate selection. |
| `ai/scripts/lifecycle/summarize-sessions.mjs` | Periodic child-process summarization must use the same skip predicate before broad drift summarization. Pending explicit jobs may still drain through their existing explicit-session path. |
| `SummarizationJobs` / resume state | Do not finalize or mark a still-active session as completed merely because a periodic child processed it. Preserve `resume_session` semantics and cross-check the pending-aware summarization barrier from #11676. |
| Observability | Logs or returned summaries should make it clear when a drift candidate was skipped because it is externally active. |
| Tests | Add focused coverage for a no-request-context child-process shape where a session is active elsewhere, plus a counter-test proving explicit `summarizeSessions({ sessionId })` still works. |

## Acceptance Criteria

- [ ] Periodic drift detection skips sessions active in another harness/process.
- [ ] The active-session predicate does not depend only on the spawned child's `currentSessionId`.
- [ ] Explicit/manual `summarizeSessions({ sessionId })` semantics are preserved.
- [ ] Pending summarization jobs keep their explicit-session behavior unless the implementation proves a specific active-session finalization conflict and documents that policy.
- [ ] Focused tests cover the spawned child / no request context case.
- [ ] Focused tests cover that explicit named-session summarization remains possible.
- [ ] Logs or returned metadata identify externally-active skips well enough for operator diagnosis.

## Out of Scope

- Re-implementing the original StorageRouter re-ranker crash fix from PR #9960.
- Re-implementing the in-process `currentSessionId` exclusion from PR #9960.
- Replacing the summarization job coordinator or `SummarizationJobs` schema wholesale.
- Changing summary visibility / tenant filtering semantics.
- Running broad full-suite summarization or closing historical sessions manually.

## Verification Anchors

- Merged original fix: PR #9960.
- Current revalidation comment: https://github.com/neomjs/neo/issues/9959#issuecomment-4636388490
- Relevant source:
  - `ai/services/memory-core/managers/StorageRouter.mjs`
  - `ai/services/memory-core/SessionService.mjs`
  - `ai/scripts/lifecycle/summarize-sessions.mjs`
  - `ai/daemons/orchestrator/TaskDefinitions.mjs`
  - `test/playwright/unit/ai/services/memory-core/QueryReRanker.spec.mjs`

Origin Session IDs:

- Original issue: `598f1a53-952e-4356-8c6f-ada3e71b6152`
- 2026-05-27 revalidation: `6ca1b510-51c3-4fac-aa39-a0fd6941318c`


## Timeline

- 2026-04-13T10:25:30Z @tobiu assigned to @tobiu
- 2026-04-13T10:25:30Z @tobiu added the `bug` label
- 2026-04-13T10:25:30Z @tobiu added the `ai` label
- 2026-04-13T10:26:20Z @tobiu referenced in commit `16faf1b` - "fix: Memory Core semantic search crash & active session summarization leak (#9959)

- StorageRouter: wrap re-ranker Pass 1 query in try/catch with graceful
  fallback to empty results, add optional chaining on all ChromaDB
  result property accesses, add logger import
- SessionService: move currentSessionId exclusion to top of
  findSessionsToSummarize loop (was only applied to Case B count
  mismatch, not Case A missing summary)
- Add 7 new Playwright tests in QueryReRanker.spec.mjs covering both
  bugs plus ChromaDB timestamp filtering validation"
- 2026-04-13T10:28:53Z @tobiu cross-referenced by PR #9960
- 2026-04-13T10:31:26Z @tobiu referenced in commit `3bc5098` - "fix: Memory Core semantic search crash & active session summarization leak (#9959) (#9960)

- StorageRouter: wrap re-ranker Pass 1 query in try/catch with graceful
  fallback to empty results, add optional chaining on all ChromaDB
  result property accesses, add logger import
- SessionService: move currentSessionId exclusion to top of
  findSessionsToSummarize loop (was only applied to Case B count
  mismatch, not Case A missing summary)
- Add 7 new Playwright tests in QueryReRanker.spec.mjs covering both
  bugs plus ChromaDB timestamp filtering validation"
- 2026-04-13T11:13:37Z @tobiu marked this issue as blocking #9961
- 2026-05-27T01:51:02Z @neo-gpt added the `regression` label
- 2026-05-27T01:51:02Z @neo-gpt added the `architecture` label
- 2026-05-27T01:51:02Z @neo-gpt added the `performance` label
- 2026-05-27T01:51:02Z @neo-gpt added the `model-experience` label
### @neo-gpt - 2026-05-27T01:51:57Z

## 2026-05-27 revalidation note

Operator surfaced this again from the orchestrator log:

```text
[2026-05-27T01:37:01.011Z] [PID:36578] [INFO] [ProcessSupervisor] Starting session summarization (periodic-sweep:600000).
```

Requested verification: running sessions should not get re-summarized over and over for every new turn.

Fresh V-B-A anchors from current `dev`/worktree source:

- `ai/daemons/orchestrator/scheduling/summary.mjs:32-37` still emits `periodic-sweep:${intervalMs}` every `summarySweepIntervalMs`.
- `ai/daemons/orchestrator/TaskDefinitions.mjs:63-68` runs the summary task as a spawned `ai/scripts/lifecycle/summarize-sessions.mjs` child.
- `ai/scripts/lifecycle/summarize-sessions.mjs:25-32` initializes `Memory_SessionService` and calls `summarizeSessions({ includeAll: false })`.
- `ai/services/memory-core/SessionService.mjs:265-266` defines `currentSessionId` as `RequestContextService.getSessionId() || this._legacySessionId`.
- `ai/services/memory-core/SessionService.mjs:464-480` excludes only `sessionId === this.currentSessionId` before selecting missing or drifted summaries.

This means the original in-process current-session leak appears partially guarded now, but the periodic child-process path still needs verification: if the spawned summarizer has no request-bound MCP session, its `currentSessionId` can resolve to the child process legacy id, not to any live harness session that is still accumulating memories. In that shape, every new turn can create memory-count drift and make the running session eligible again.

Suggested AC refresh for this existing ticket:

- [ ] Reproduce or falsify with two consecutive `periodic-sweep:600000` runs while an active harness session receives new `add_memory` turns; log the selected `sessionId` candidates and whether any are currently running.
- [ ] Define the cross-process active-session predicate used by periodic summarization. It must not depend only on the spawned child process `currentSessionId`.
- [ ] Ensure periodic sweeps skip running sessions unless an explicit finalization path is used, while still summarizing completed, sunset-handover, crashed, or manually requested sessions.
- [ ] Preserve explicit operator/manual summarization semantics, including direct `sessionId` summarization when that is intentionally requested.
- [ ] Add focused coverage for the spawned child process / no request context case so #9959 cannot regress through the orchestrator path.
- [ ] Cross-check Discussion #11676 pending-aware summarization barrier: do not finalize a summary while pending `AGENT_MEMORY` embeddings can make the summary incomplete.

Metadata update applied: attached this still-open ticket to Project 12 and added current v13 labels `regression`, `architecture`, `model-experience`, and `performance` while preserving `bug` + `ai`.

Origin Session ID: `6ca1b510-51c3-4fac-aa39-a0fd6941318c`

Retrieval Hint: `periodic-sweep 600000 running sessions re-summarized every new turn currentSessionId spawned summarize-sessions child #9959 #11676`

- 2026-05-27T02:06:11Z @neo-gpt cross-referenced by #12065
- 2026-06-05T23:26:10Z @tobiu unassigned from @tobiu
- 2026-06-05T23:34:13Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-05T23:34:28Z

**Input from GPT-5.5 (Codex Desktop):**

> ● ## 2026-06-06 intake classification
> 
> **Verdict:** `needs-narrowing` as written.
> 
> The ticket body still describes the original two-bug fix, but that exact implementation already landed in merged PR #9960 on 2026-04-13:
> 
> - `StorageRouter` re-ranker Pass 1 is now wrapped in `try/catch`, logs fallback, and uses optional chaining on Chroma query result surfaces.
> - `SessionService.findSessionsToSummarize()` now excludes `sessionId === this.currentSessionId` before both missing-summary and count-mismatch cases.
> - `QueryReRanker.spec.mjs` already has focused coverage for the re-ranker defensive path and in-process active-session exclusion.
> 
> Fresh V-B-A against current source shows one remaining valid concern, but it is narrower than the original body:
> 
> - `ai/daemons/orchestrator/TaskDefinitions.mjs` still runs the summary task as a spawned `ai/scripts/lifecycle/summarize-sessions.mjs` child.
> - `summarize-sessions.mjs` initializes `Memory_SessionService` in that child and calls `summarizeSessions({ includeAll: false })`.
> - `findSessionsToSummarize()` excludes only `this.currentSessionId`, which resolves to `RequestContextService.getSessionId() || this._legacySessionId`.
> - In the spawned child path there is no request-bound MCP session for the live harness sessions still accumulating memories, so the child-process current-session guard can miss active sessions from other processes.
> - I did not find current coverage for this cross-process active-session predicate. The existing in-process skip test is necessary but insufficient for the periodic child path.
> 
> **Routing recommendation:** do not re-implement the original #9959 body. Either rewrite this issue body or split a new leaf ticket around the remaining contract:
> 
> > Periodic child-process summarization must skip sessions that are active in another harness/process unless summarization is explicit/finalizing/manual. The predicate cannot depend only on the child process `currentSessionId`; it should define and test the cross-process active-session source of truth, preserve explicit `summarizeSessions({sessionId})` semantics, and cross-check the pending-aware summarization barrier from #11676.
> 
> Implementation should start only after that narrowed contract is accepted. Until then, this issue is parked behind `needs-re-triage` to prevent duplicate work against the already-merged #9960 surface.
> 
> [ARCH_ALIGNMENT]: The current architecture no longer matches the ticket body. The remaining useful work is not a broad semantic-search + in-process summarization fix; it is a cross-process active-session / periodic-summarizer contract problem.

- 2026-06-05T23:37:49Z @neo-gpt changed title from **fix: Memory Core semantic search crash & active session summarization leak** to **fix(memory): periodic summarization must skip externally active sessions**
- 2026-06-05T23:37:56Z @neo-gpt removed the `needs-re-triage` label
- 2026-06-05T23:44:51Z @neo-gpt assigned to @neo-gpt
- 2026-06-05T23:51:25Z @neo-gpt cross-referenced by PR #12605
- 2026-06-06T00:01:33Z @neo-gpt referenced in commit `b889ff5` - "fix(memory): skip externally active drift summaries (#9959)"
- 2026-06-06T00:01:33Z @neo-gpt referenced in commit `4bcea2e` - "test(memory): cover explicit active session summaries (#9959)"
- 2026-06-06T00:15:49Z @neo-gpt referenced in commit `4589e22` - "fix(memory): protect parallel active sessions (#9959)"
- 2026-06-06T00:33:30Z @neo-gpt referenced in commit `0ab38aa` - "fix(memory): align active-session config (#9959)"
- 2026-06-06T10:17:03Z @neo-opus-grace cross-referenced by #12628
- 2026-06-06T10:57:57Z @neo-gpt cross-referenced by PR #12629
- 2026-06-06T15:23:38Z @neo-gpt referenced in commit `f78d0ac` - "fix(memory): skip externally active drift summaries (#9959)"
- 2026-06-06T15:23:38Z @neo-gpt referenced in commit `b33a9c3` - "test(memory): cover explicit active session summaries (#9959)"
- 2026-06-06T15:23:38Z @neo-gpt referenced in commit `2bc91b9` - "fix(memory): protect parallel active sessions (#9959)"
- 2026-06-06T15:23:38Z @neo-gpt referenced in commit `6833822` - "fix(memory): align active-session config (#9959)"
- 2026-06-06T15:23:38Z @neo-gpt referenced in commit `6f415db` - "fix(memory): reuse swarm idle threshold (#9959)"
- 2026-06-06T17:01:18Z @tobiu referenced in commit `9b4feff` - "fix(memory): skip externally active drift summaries (#9959) (#12605)

* fix(memory): skip externally active drift summaries (#9959)

* test(memory): cover explicit active session summaries (#9959)

* fix(memory): protect parallel active sessions (#9959)

* fix(memory): align active-session config (#9959)

* fix(memory): reuse swarm idle threshold (#9959)"
- 2026-06-06T17:01:18Z @tobiu closed this issue

