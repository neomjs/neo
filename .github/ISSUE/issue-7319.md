---
id: 7319
title: Create Memory Query Tool
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-01T20:55:15Z'
updatedAt: '2025-10-02T10:12:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7319'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-02T10:12:33Z'
---
# Create Memory Query Tool

**Reported by:** @tobiu on 2025-10-01

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

This ticket covers the creation of a new CLI command (`npm run ai:query-memory`) that will allow the AI agent to perform semantic searches against its own memory database. This is the core of the "Recall Engine."

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/queryMemory.mjs`) and linked to an `npm` script.
2.  The script accepts a query string (`-q`) as input.
3.  It generates an embedding for the query and uses it to find the most relevant documents in the `neo-agent-memory` ChromaDB collection.
4.  The script returns a ranked list of results, similar to the existing `ai:query` tool, allowing the agent to access its most relevant memories.

