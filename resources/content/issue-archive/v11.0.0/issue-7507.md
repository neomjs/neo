---
id: 7507
title: Implement Query Documents Service
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T10:47:57Z'
updatedAt: '2025-10-16T10:54:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7507'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-16T10:54:35Z'
---
# Implement Query Documents Service

This ticket covers the implementation of the `query_documents` service for the AI Knowledge Base MCP server. This is the primary read operation for the server, allowing AI agents to perform semantic searches against the vector database.

The implementation will be adapted from the existing `buildScripts/ai/queryKnowledgeBase.mjs` script.

## Acceptance Criteria

1.  A new `ai/mcp/server/knowledge-base/services/queryService.mjs` file is created.
2.  The service contains a `queryDocuments` function that takes a `query` string and an optional `type` filter.
3.  The function connects to ChromaDB, generates an embedding for the query, and retrieves the most relevant documents.
4.  The function applies the existing scoring algorithm to the results.
5.  The function returns a JSON object containing the ranked list of results, matching the `QueryResponse` schema in `openapi.yaml`.
6.  The `toolService.mjs` `serviceMapping` is updated to point the `query_documents` operationId to the new service function.

## Timeline

- 2025-10-16T10:47:57Z @tobiu assigned to @tobiu
- 2025-10-16T10:47:58Z @tobiu added parent issue #7501
- 2025-10-16T10:47:58Z @tobiu added the `enhancement` label
- 2025-10-16T10:47:58Z @tobiu added the `ai` label
- 2025-10-16T10:54:04Z @tobiu referenced in commit `cfab82c` - "Implement Query Documents Service #7507"
- 2025-10-16T10:54:35Z @tobiu closed this issue

