---
id: 9942
title: 'bug(ai): Resolve local inference 4096 n_ctx Exhaustion During Session Summarization'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-04-12T19:31:19Z'
updatedAt: '2026-04-12T21:39:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9942'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T20:36:36Z'
---
# bug(ai): Resolve local inference 4096 n_ctx Exhaustion During Session Summarization

### Context
When the Memory service attempts to summarize a massive session (e.g., ones with over 50-100 interactions), it joins all memory documents into a single `aggregatedContent` payload. For Local LLMs running with a default `n_ctx` limit of 4096, this payload throws an Out-Of-Memory / context length exceeded error.
Because the loop executing the batch in `SessionService.summarizeSessions()` lacks granular `try/catch` protection for individual session iterations, a single context length violation permanently halts the entire digestion daemon. This is why the `session` collection currently has `0` records after the vector DB engine swap.

### Objectives
1. Implement a safe truncation envelope (`MAX_PAYLOAD_LENGTH`) inside `SessionService.summarizeSession()`, slicing the middle out of oversized sessions to preserve original prompt context and final outcomes.
2. Wrap the LLM `generateContent` block inside an internal `try/catch` within the batch iterator, ensuring that if a session summary fails, it isolates the failure and allows `processUndigestedSessions` to continue processing the remaining batches.

## Timeline

- 2026-04-12T19:31:21Z @tobiu added the `bug` label
- 2026-04-12T19:31:21Z @tobiu added the `ai` label
- 2026-04-12T19:31:21Z @tobiu added the `core` label
- 2026-04-12T20:14:05Z @tobiu cross-referenced by PR #9943
- 2026-04-12T20:36:19Z @tobiu referenced in commit `b0cb622` - "fix(memory-core): Enforce explicit DreamService system prompt and token boundaries to resolve local inference context exhaustion (#9942)"
- 2026-04-12T20:36:31Z @tobiu cross-referenced by PR #9944
- 2026-04-12T20:36:36Z @tobiu referenced in commit `d1e89a9` - "fix(memory-core): Enforce explicit DreamService system prompt and token boundaries to resolve local inference context exhaustion (#9942) (#9944)"
- 2026-04-12T20:36:36Z @tobiu closed this issue
- 2026-04-12T21:39:00Z @tobiu assigned to @tobiu

