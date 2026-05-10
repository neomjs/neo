---
id: 7923
title: 'Refactor: Extract Memory Core to @neomjs/ai-memory-server'
state: CLOSED
labels:
  - stale
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-29T15:19:26Z'
updatedAt: '2026-03-14T03:37:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7923'
author: tobiu
commentsCount: 2
parentIssue: 7919
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T03:37:21Z'
---
# Refactor: Extract Memory Core to @neomjs/ai-memory-server

# Refactor: Extract Memory Core to @neomjs/ai-memory-server

## Context
To enable broader adoption (Epic #7919), we need to extract the Memory Core from the monorepo into a standalone package.

## Requirements
1.  **Separation:** Move `ai/mcp/server/memory-core` code to a structure that can be published independently.
2.  **Dependencies:** Ensure it depends on `@neomjs/ai-core` (if created) or bundles its dependencies.
3.  **CLI:** Ensure the `runner.mjs` can be invoked via `npx`.
4.  **Publishing:** Setup `package.json` for npm publication.

## Output
*   A published npm package `@neomjs/ai-memory-server`.


## Timeline

- 2025-11-29T15:19:27Z @tobiu added the `ai` label
- 2025-11-29T15:19:27Z @tobiu added the `refactoring` label
- 2025-11-29T15:22:19Z @tobiu added parent issue #7919
### @github-actions - 2026-02-28T03:22:07Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-02-28T03:22:08Z @github-actions added the `stale` label
### @github-actions - 2026-03-14T03:37:20Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-03-14T03:37:21Z @github-actions closed this issue

