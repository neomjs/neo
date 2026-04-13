---
id: 9965
title: Implement Map-Reduce Session Summarization Pipeline (Prio 0)
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T11:53:11Z'
updatedAt: '2026-04-13T11:59:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9965'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T11:59:20Z'
---
# Implement Map-Reduce Session Summarization Pipeline (Prio 0)

### Context
In PR #9964, we implemented a tail-end truncation mechanism (max 10,000 chars) for `SessionService` to prevent `n_ctx` token exhaustion crashes during local LLM summarization. 

While this stabilizes the REM pipeline and prevents the daemon from crashing, it is mathematically lossy. By truncating the chronological head of the session, we lose critical context regarding the original problem statement, hypotheses, and initial exploratory commands, summarizing only the "resolution".

### Required Architecture
To achieve 100% data preservation while remaining strictly within the `n_ctx: 4096` local constraints, we must refactor `SessionService.summarizeSession()` to utilize a **Map-Reduce** pipeline:

1. **Map (Chunking):** Slice the `memories.documents` array into chronological batches that safely fit within a ~3000 token limit.
2. **Reduce (Sub-Summaries):** Iterate over these batches, invoking the local AI provider to generate a sequential sub-summary.
3. **Compress:** Feed the array of generated sub-summaries into a final compression prompt to generate the ultimate, all-encompassing `SessionSummary` object without overflowing the context window.

### Graph Links
- Blocks #9954 (Self-Healing Protocol) by ensuring historical accuracy.
- Conceptual successor to #9921.

## Timeline

- 2026-04-13T11:53:12Z @tobiu added the `enhancement` label
- 2026-04-13T11:53:12Z @tobiu added the `ai` label
- 2026-04-13T11:57:35Z @tobiu referenced in commit `5a4330a` - "feat(MemoryCore): Implement lossless Map-Reduce chunking for massive REM sessions (#9965)"
- 2026-04-13T11:58:37Z @tobiu cross-referenced by PR #9966
- 2026-04-13T11:59:20Z @tobiu referenced in commit `670c9a1` - "feat(MemoryCore): Implement lossless Map-Reduce chunking for massive REM sessions (#9965) (#9966)"
- 2026-04-13T11:59:20Z @tobiu closed this issue

