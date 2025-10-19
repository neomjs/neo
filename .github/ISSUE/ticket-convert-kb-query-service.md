---
title: "Convert queryService to QueryService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7554

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring the final service for the knowledge-base server, `ai/mcp/server/knowledge-base/services/queryService.mjs`, into a singleton `QueryService` class. This service is responsible for performing semantic search against the knowledge base and includes complex logic for scoring and ranking results.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/queryService.mjs` is renamed to `QueryService.mjs`.
2.  The content is replaced with a `QueryService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `queryDocuments` function is converted into a class method.
4.  The new class uses the `ChromaManager` service to interact with the database.
5.  The complex scoring and ranking logic is fully preserved and functions identically to the original.
6.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to use the new `QueryService` class and its method.
7.  The `query_documents` tool continues to function correctly.
