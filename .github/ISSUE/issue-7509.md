---
id: 7509
title: Implement Document Retrieval Services
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T11:06:49Z'
updatedAt: '2025-10-16T11:11:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7509'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T11:11:44Z'
---
# Implement Document Retrieval Services

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

This ticket covers the implementation of the previously optional document retrieval endpoints. This will provide essential tools for inspecting and debugging the contents of the knowledge base.

Two distinct tools will be created:
1.  `list_documents`: To list documents from the collection, with support for pagination.
2.  `get_document_by_id`: To retrieve a single document by its unique ID.

## Acceptance Criteria

1.  The `openapi.yaml` file is updated with two new endpoints:
    - `GET /documents`
    - `GET /documents/{id}`
2.  The endpoints have `operationId`s of `list_documents` and `get_document_by_id` respectively.
3.  A new `ai/mcp/server/knowledge-base/services/documentService.mjs` file is created.
4.  The service contains `listDocuments` and `getDocumentById` functions.
5.  The `toolService.mjs` `serviceMapping` is updated to point the new `operationId`s to their respective service functions.

