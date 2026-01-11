---
id: 7924
title: 'Refactor: Extract GitHub Workflow to @neomjs/ai-github-server'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-29T15:19:36Z'
updatedAt: '2025-11-29T15:19:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7924'
author: tobiu
commentsCount: 0
parentIssue: 7919
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Extract GitHub Workflow to @neomjs/ai-github-server

# Refactor: Extract GitHub Workflow to @neomjs/ai-github-server

## Context
To enable broader adoption (Epic #7919), we need to extract the GitHub Workflow server into a standalone package.

## Requirements
1.  **Separation:** Move `ai/mcp/server/github-workflow` code to a standalone structure.
2.  **Cross-Repo Support:** Ensure the server can handle `repo` and `org` flags dynamically (essential for the Agent OS vision).
3.  **CLI:** Ensure it is `npx` executable.

## Output
*   A published npm package `@neomjs/ai-github-server`.


## Timeline

- 2025-11-29T15:19:37Z @tobiu added the `ai` label
- 2025-11-29T15:19:37Z @tobiu added the `refactoring` label
- 2025-11-29T15:22:21Z @tobiu added parent issue #7919

