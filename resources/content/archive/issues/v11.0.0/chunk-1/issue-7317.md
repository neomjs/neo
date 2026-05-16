---
id: 7317
title: Set up Memory ChromaDB
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-01T20:52:32Z'
updatedAt: '2025-10-02T08:40:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7317'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T08:40:41Z'
---
# Set up Memory ChromaDB

This ticket covers the initial setup of a new, dedicated ChromaDB instance to serve as the persistent memory for the AI agent. This database will be separate from the existing framework knowledge base.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/setupMemoryDB.mjs`) to initialize the ChromaDB client for the memory store.
2.  The script should create a new ChromaDB collection specifically for agent memories (e.g., `neo-agent-memory`).
3.  Configuration for the memory database (e.g., path, collection name) should be managed in a central location.

## Timeline

- 2025-10-01T20:52:33Z @tobiu assigned to @tobiu
- 2025-10-01T20:52:34Z @tobiu added parent issue #7316
- 2025-10-01T20:52:34Z @tobiu added the `enhancement` label
- 2025-10-02T08:40:25Z @tobiu referenced in commit `b70fcfe` - "Set up Memory ChromaDB #7317"
- 2025-10-02T08:40:41Z @tobiu closed this issue

