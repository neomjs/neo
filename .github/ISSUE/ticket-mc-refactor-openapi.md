---
title: "Refactor Memory Core OpenAPI for MCP"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7522

**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket involves refactoring the existing `openapi.yaml` from its RESTful structure to a flat, `operationId`-driven format suitable for an MCP server. Each REST endpoint will be translated into a distinct tool.

## Acceptance Criteria

1.  The `openapi.yaml` in `ai/mcp/server/memory-core/` is updated.
2.  Each path/method combination from the old API is converted into a unique operation with a descriptive `operationId` (e.g., `add_memory`, `query_summaries`).
3.  The `paths` object is flattened, removing the RESTful URL structure.
4.  All schemas, descriptions, and examples are preserved and correctly associated with their new tool definitions.
