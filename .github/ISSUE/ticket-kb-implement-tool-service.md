---
title: Implement Knowledge Base Tool Service
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7504

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers the implementation of the `toolService.mjs` for the new AI Knowledge Base MCP server. The implementation will be adapted from the existing `toolService.mjs` in the `github-workflow` server.

The goal is to create the service that dynamically parses the `openapi.yaml` file, builds Zod schemas for validation, and maps `operationId`s to handler functions.

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/toolService.mjs` is created.
2.  The logic is adapted from `ai/mcp/server/github-workflow/services/toolService.mjs`.
3.  It correctly reads `ai/mcp/server/knowledge-base/openapi.yaml`.
4.  A `serviceMapping` object is created, mapping the `operationId`s from the OpenAPI spec to service functions.
5.  For this initial ticket, the mapped service functions can be placeholders/dummies (e.g., `() => Promise.resolve('Not implemented yet')`).
6.  The module exports `listTools` and `callTool` functions that are ready for integration with `mcp-stdio.mjs`.
