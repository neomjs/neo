---
id: 7810
title: 'Refactor: Rename ChromaDB data directories for clarity'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T13:54:25Z'
updatedAt: '2025-11-19T13:59:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7810'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T13:59:16Z'
---
# Refactor: Rename ChromaDB data directories for clarity

The current ChromaDB data directory names (`chroma` and `chroma-memory`) are generic and inconsistent. We should rename them to `chroma-neo-knowledge-base` and `chroma-neo-memory-core` to be more descriptive and align with the server names.

Tasks:
- Rename existing directories on disk.
- Update `ai/mcp/server/knowledge-base/config.mjs`.
- Update `ai/mcp/server/memory-core/config.mjs`.
- Update `package.json` scripts.
- Update `.gitignore`.

## Timeline

- 2025-11-19T13:54:26Z @tobiu added the `enhancement` label
- 2025-11-19T13:54:26Z @tobiu added the `ai` label
- 2025-11-19T13:54:27Z @tobiu added the `refactoring` label
- 2025-11-19T13:54:43Z @tobiu assigned to @tobiu
- 2025-11-19T13:58:53Z @tobiu referenced in commit `fa953b2` - "Refactor: Rename ChromaDB data directories for clarity #7810"
- 2025-11-19T13:59:16Z @tobiu closed this issue

