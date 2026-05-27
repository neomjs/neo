---
id: 9959
title: 'fix: Memory Core semantic search crash & active session summarization leak'
state: OPEN
labels:
  - bug
  - ai
  - regression
  - architecture
  - performance
  - model-experience
assignees:
  - tobiu
createdAt: '2026-04-13T10:25:29Z'
updatedAt: '2026-05-27T01:51:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9959'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9961 Pre-Task Retrospective Query — Active Memory Consumption'
---
# fix: Memory Core semantic search crash & active session summarization leak

## Problem

Two defects in the Memory Core MCP server cause degraded agent memory retrieval and wasteful LLM token consumption:

### Bug 1: `StorageRouter` Re-Ranker Crash
**Symptom:** `query_raw_memories` and `query_summaries` MCP tools crash with `Cannot read properties of undefined (reading '0')`.

**Root Cause:** `StorageRouter.injectQueryReRanker()` monkey-patches `collection.query()` but does not wrap the underlying ChromaDB query call in error handling. If the embedding function fails (Gemini API rate limit, key missing, network error), the exception propagates uncaught. Additionally, result property accesses (`searchResult.ids[0]`, `searchResult.distances[0]`) lack optional chaining, crashing on malformed results.

**Impact:** All semantic search capabilities are broken when the embedding provider has transient failures. Agents cannot retrieve past memories or summaries via vector search.

### Bug 2: `SessionService` Active Session Summarization Leak
**Symptom:** `findSessionsToSummarize()` flags the current active session for summarization on every startup, despite the session still actively accumulating memories.

**Root Cause:** The `currentSessionId` exclusion was only applied to **Case B** (count mismatch) but NOT **Case A** (missing summary). Since every new session starts with no summary, the active session always hits Case A and gets flagged — producing incomplete, mid-flight summaries and wasting LLM inference tokens.

**Impact:** Wasteful summarization of incomplete sessions. The previous session (`e79cd582` with 20 memories) was NOT summarized because the summarization budget was consumed by attempting to summarize the active session instead.

## Solution

### `StorageRouter.mjs`
- Wrap Pass 1 semantic retrieval in `try/catch` with graceful fallback to empty result `{ids: [[]], distances: [[]], metadatas: [[]]}`
- Replace all bare property accesses with optional chaining (`searchResult?.ids?.[0]`, `searchResult.distances?.[0]`, etc.)
- Add `logger` import for error reporting

### `SessionService.mjs`
- Move the `currentSessionId` exclusion to the top of the `forEach` loop, before either Case A or Case B checks
- This ensures the active session is never flagged for summarization regardless of whether a summary exists

## Verification
- 7 new Playwright tests in `QueryReRanker.spec.mjs` covering both bugs
- Full memory-core test suite: 18/18 passed, 0 regressions
- Live MCP server verification: both `query_raw_memories` and `query_summaries` return valid results after restart

## A2A Context
Origin Session ID: `598f1a53-952e-4356-8c6f-ada3e71b6152`

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

