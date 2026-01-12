---
id: 7554
title: Convert queryService to QueryService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T22:08:37Z'
updatedAt: '2025-10-19T22:13:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7554'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T22:13:58Z'
---
# Convert queryService to QueryService Neo.mjs Class

This ticket covers refactoring the final service for the knowledge-base server, `ai/mcp/server/knowledge-base/services/queryService.mjs`, into a singleton `QueryService` class. This service is responsible for performing semantic search against the knowledge base and includes complex logic for scoring and ranking results.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/queryService.mjs` is renamed to `QueryService.mjs`.
2.  The content is replaced with a `QueryService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `queryDocuments` function is converted into a class method.
4.  The new class uses the `ChromaManager` service to interact with the database.
5.  The complex scoring and ranking logic is fully preserved and functions identically to the original.
6.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to use the new `QueryService` class and its method.
7.  The `query_documents` tool continues to function correctly.

## Timeline

- 2025-10-19T22:08:37Z @tobiu assigned to @tobiu
- 2025-10-19T22:08:38Z @tobiu added the `enhancement` label
- 2025-10-19T22:08:38Z @tobiu added parent issue #7536
- 2025-10-19T22:08:38Z @tobiu added the `ai` label
- 2025-10-19T22:13:58Z @tobiu closed this issue
- 2025-10-19T22:14:20Z @tobiu referenced in commit `35078e2` - "Convert queryService to QueryService Neo.mjs Class #7554"

