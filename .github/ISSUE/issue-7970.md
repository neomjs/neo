---
id: 7970
title: Implement Context Window Compression
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T16:04:26Z'
updatedAt: '2025-12-01T16:09:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7970'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Context Window Compression

**Goal:** Prevent context window overflows in long-running agent sessions.
**Scope:**
1.  **Compression Strategy:** Implement logic in `Neo.ai.context.Assembler` to prune or summarize message history when it exceeds a token threshold.
2.  **Summarization:** Use `Memory_SessionService` to generate intermediate summaries for older messages instead of dropping them.
**Context:** Follow-up to Epic #7961.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu assigned to @tobiu

