---
title: Implement Document Retrieval Services
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7509

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

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
