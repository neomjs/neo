---
id: 9933
title: 'Fix: DreamService Sandman Cycle Aborts Prematurely'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T17:09:17Z'
updatedAt: '2026-04-12T17:11:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9933'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T17:11:28Z'
---
# Fix: DreamService Sandman Cycle Aborts Prematurely

**Context:**
Running the `buildScripts/ai/runSandman.mjs` headless process triggers the `DreamService.processUndigestedSessions()` pipeline. This pipeline is responsible for two distinct workflows:
1. Digesting new Agent session memories natively into the Edge Graph.
2. Ambiently performing memory-core maintenance (Graph Apoptosis, Semantic Vector synchronization, and Golden Path roadmap synthesis).

**The Bug:**
If `DreamService` found no *new* session memories, it aborted execution via an early `return;`. This immediately halted the entire Sandman REM cycle, bypassing both the Garbage Collection topology phase and the strategic Golden Path synthesis loops.

**The Fix:**
Modified `DreamService.processUndigestedSessions` to bifurcate the behavior. If no sessions are found, it gracefully skips the memory ingestion iterations but now correctly proceeds forward to execute the ambient Garbage Collection and Hybrid GraphRAG Strategic Extraction routines.

## Timeline

- 2026-04-12T17:09:18Z @tobiu added the `bug` label
- 2026-04-12T17:09:19Z @tobiu added the `ai` label
- 2026-04-12T17:09:27Z @tobiu referenced in commit `5e8137e` - "fix: Remove early abort in Sandman pipeline to permit ambient GC and GoldenPath (#9933)"
- 2026-04-12T17:09:33Z @tobiu cross-referenced by PR #9934
- 2026-04-12T17:11:28Z @tobiu referenced in commit `0bba2e0` - "fix: Remove early abort in Sandman pipeline to permit ambient GC and GoldenPath (#9933) (#9934)"
- 2026-04-12T17:11:28Z @tobiu closed this issue
- 2026-04-12T17:11:44Z @tobiu assigned to @tobiu

