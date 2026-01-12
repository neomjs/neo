---
id: 7537
title: 'PoC: Refactor ChromaManager to a Neo.mjs Class'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T10:14:14Z'
updatedAt: '2025-10-18T10:56:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7537'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-18T10:56:22Z'
---
# PoC: Refactor ChromaManager to a Neo.mjs Class

This ticket covers the first phase of the "Integrate Neo.mjs Core into MCP Servers" epic. The goal is to refactor the `ai/mcp/server/memory-core/services/chromaManager.mjs` into a singleton class that extends `Neo.core.Base`. This will serve as a proof of concept to evaluate the viability and benefits of using the Neo class system for our MCP server architecture.

## Acceptance Criteria

1.  The `chromaManager.mjs` module is refactored into a `ChromaManager` class.
2.  The `ChromaManager` class extends `Neo.core.Base` and is configured as a singleton.
3.  State variables (e.g., `client`) are moved into the Neo config system (e.g., `client_`).
4.  Existing functions are converted into class methods.
5.  The `onConstructed` lifecycle hook is used for initialization logic, such as creating the ChromaDB client.
6.  The `memory-core` server's entry point (`mcp-stdio.mjs`) is updated to initialize the Neo core.
7.  Service handlers that depend on `chromaManager` are updated to use the new singleton instance.
8.  The `neo-memory-core__healthcheck` tool and other related tools continue to function correctly after the refactoring.

## Timeline

- 2025-10-18T10:14:14Z @tobiu assigned to @tobiu
- 2025-10-18T10:14:15Z @tobiu added parent issue #7536
- 2025-10-18T10:14:16Z @tobiu added the `enhancement` label
- 2025-10-18T10:14:16Z @tobiu added the `ai` label
- 2025-10-18T10:56:20Z @tobiu referenced in commit `2709e54` - "PoC: Refactor ChromaManager to a Neo.mjs Class #7537"
- 2025-10-18T10:56:22Z @tobiu closed this issue

