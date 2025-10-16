---
title: Implement Delete Database Service
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #placeholder

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the implementation of the `delete_database` service for the AI Knowledge Base MCP server. This service will expose the destructive but necessary functionality to completely remove the knowledge base collection from ChromaDB, allowing for a clean reset.

## Acceptance Criteria

1.  A new `ai/mcp/server/knowledge-base/services/databaseService.mjs` file is created.
2.  The service contains a `deleteDatabase` function that connects to ChromaDB and deletes the collection specified in `aiConfig`.
3.  The function returns a success message upon completion.
4.  The `toolService.mjs` `serviceMapping` is updated to point the `delete_database` operationId to the new service function.
