---
id: 7528
title: Use Centralized AI Config in Memory Core Services
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:24:36Z'
updatedAt: '2025-10-17T12:26:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7528'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T12:26:16Z'
---
# Use Centralized AI Config in Memory Core Services

Several services within the `memory-core` server are importing the old `aiConfig` from `buildScripts` instead of the new, centralized `aiConfig` located at `ai/mcp/server/config.mjs`. This ties the new server to the old build system and must be corrected.

## Acceptance Criteria

1.  The `aiConfig` import path is corrected in `chromaManager.mjs`.
2.  The `aiConfig` import path is corrected in `dbService.mjs`.
3.  The `aiConfig` import path is corrected in `healthService.mjs`.
4.  The `aiConfig` import path is corrected in `sessionService.mjs`.
5.  The `aiConfig` import path is corrected in `textEmbeddingService.mjs`.

## Timeline

- 2025-10-17T12:24:36Z @tobiu assigned to @tobiu
- 2025-10-17T12:24:37Z @tobiu added the `enhancement` label
- 2025-10-17T12:24:37Z @tobiu added parent issue #7520
- 2025-10-17T12:24:38Z @tobiu added the `ai` label
- 2025-10-17T12:26:06Z @tobiu referenced in commit `6d72263` - "Use Centralized AI Config in Memory Core Services #7528"
- 2025-10-17T12:26:16Z @tobiu closed this issue

