---
id: 7552
title: Convert documentService to DocumentService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T21:48:48Z'
updatedAt: '2025-10-19T21:53:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7552'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-19T21:53:18Z'
---
# Convert documentService to DocumentService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/documentService.mjs` into a singleton class that extends `Neo.core.Base`. The file will be renamed to `DocumentService.mjs` to follow project conventions. This service is responsible for listing and retrieving individual documents from the knowledge base.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/documentService.mjs` is renamed to `DocumentService.mjs`.
2.  The content is replaced with a `DocumentService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`listDocuments`, `getDocumentById`) are converted into class methods.
4.  The new class uses the `ChromaManager` service to interact with the database.
5.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to import the `DocumentService` class and map its methods.
6.  All related tools (`list_documents`, `get_document_by_id`) continue to function correctly after the refactoring.

## Timeline

- 2025-10-19T21:48:48Z @tobiu assigned to @tobiu
- 2025-10-19T21:48:49Z @tobiu added the `enhancement` label
- 2025-10-19T21:48:49Z @tobiu added the `ai` label
- 2025-10-19T21:48:50Z @tobiu added parent issue #7536
- 2025-10-19T21:51:43Z @tobiu referenced in commit `c67da5b` - "Convert documentService to DocumentService Neo.mjs Class #7552"
- 2025-10-19T21:53:18Z @tobiu closed this issue

