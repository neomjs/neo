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
closedAt: '2025-10-02T08:40:41Z'
---
# Set up Memory ChromaDB

**Reported by:** @tobiu on 2025-10-01

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

This ticket covers the initial setup of a new, dedicated ChromaDB instance to serve as the persistent memory for the AI agent. This database will be separate from the existing framework knowledge base.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/setupMemoryDB.mjs`) to initialize the ChromaDB client for the memory store.
2.  The script should create a new ChromaDB collection specifically for agent memories (e.g., `neo-agent-memory`).
3.  Configuration for the memory database (e.g., path, collection name) should be managed in a central location.

