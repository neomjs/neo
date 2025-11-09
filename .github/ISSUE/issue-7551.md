---
id: 7551
title: Convert databaseService to DatabaseService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T21:19:09Z'
updatedAt: '2025-10-19T21:47:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7551'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-19T21:47:27Z'
---
# Convert databaseService to DatabaseService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-19

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/databaseService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `DatabaseService.mjs` to follow a more consistent naming convention. This service handles creating, embedding, syncing, and deleting the knowledge base.

## Acceptance Criteria

1.  A new file `ai/mcp/server/knowledge-base/services/DatabaseService.mjs` is created with the refactored `DatabaseService` class content.
2.  The `DatabaseService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`createKnowledgeBase`, `deleteDatabase`, `embedKnowledgeBase`, `syncDatabase`) are converted into class methods.
4.  The old file `ai/mcp/server/knowledge-base/services/databaseService.mjs` is deleted.
5.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to import the `DatabaseService` class and map its methods statically.
6.  All related tools (`sync_database`, `create_knowledge_base`, `embed_knowledge_base`, `delete_database`) continue to function correctly after the refactoring.

