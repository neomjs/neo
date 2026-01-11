---
id: 7923
title: 'Refactor: Extract Memory Core to @neomjs/ai-memory-server'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-29T15:19:26Z'
updatedAt: '2025-11-29T15:19:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7923'
author: tobiu
commentsCount: 0
parentIssue: 7919
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

