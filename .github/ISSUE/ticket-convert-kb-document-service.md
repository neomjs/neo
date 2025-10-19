---
title: "Convert documentService to DocumentService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7552

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/documentService.mjs` into a singleton class that extends `Neo.core.Base`. The file will be renamed to `DocumentService.mjs` to follow project conventions. This service is responsible for listing and retrieving individual documents from the knowledge base.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/documentService.mjs` is renamed to `DocumentService.mjs`.
2.  The content is replaced with a `DocumentService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`listDocuments`, `getDocumentById`) are converted into class methods.
4.  The new class uses the `ChromaManager` service to interact with the database.
5.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to import the `DocumentService` class and map its methods.
6.  All related tools (`list_documents`, `get_document_by_id`) continue to function correctly after the refactoring.
