---
title: Implement Query Documents Service
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7507

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the implementation of the `query_documents` service for the AI Knowledge Base MCP server. This is the primary read operation for the server, allowing AI agents to perform semantic searches against the vector database.

The implementation will be adapted from the existing `buildScripts/ai/queryKnowledgeBase.mjs` script.

## Acceptance Criteria

1.  A new `ai/mcp/server/knowledge-base/services/queryService.mjs` file is created.
2.  The service contains a `queryDocuments` function that takes a `query` string and an optional `type` filter.
3.  The function connects to ChromaDB, generates an embedding for the query, and retrieves the most relevant documents.
4.  The function applies the existing scoring algorithm to the results.
5.  The function returns a JSON object containing the ranked list of results, matching the `QueryResponse` schema in `openapi.yaml`.
6.  The `toolService.mjs` `serviceMapping` is updated to point the `query_documents` operationId to the new service function.
