---
id: 7506
title: Implement Delete Database Service
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T10:43:35Z'
updatedAt: '2025-10-16T10:45:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7506'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-16T10:45:33Z'
---
# Implement Delete Database Service

This ticket covers the implementation of the `delete_database` service for the AI Knowledge Base MCP server. This service will expose the destructive but necessary functionality to completely remove the knowledge base collection from ChromaDB, allowing for a clean reset.

## Acceptance Criteria

1.  A new `ai/mcp/server/knowledge-base/services/databaseService.mjs` file is created.
2.  The service contains a `deleteDatabase` function that connects to ChromaDB and deletes the collection specified in `aiConfig`.
3.  The function returns a success message upon completion.
4.  The `toolService.mjs` `serviceMapping` is updated to point the `delete_database` operationId to the new service function.

## Timeline

- 2025-10-16T10:43:35Z @tobiu assigned to @tobiu
- 2025-10-16T10:43:36Z @tobiu added the `enhancement` label
- 2025-10-16T10:43:36Z @tobiu added the `ai` label
- 2025-10-16T10:43:36Z @tobiu added parent issue #7501
- 2025-10-16T10:45:07Z @tobiu referenced in commit `8713465` - "Implement Delete Database Service #7506"
- 2025-10-16T10:45:33Z @tobiu closed this issue

