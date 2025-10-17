---
title: Refactor toolService.mjs to Reduce Code Duplication
labels: enhancement, AI
---

Parent epic: #7501
GH ticket id: #7517

**Phase:** 3
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket addresses the code duplication between the `toolService.mjs` files in the `knowledge-base` and `github-workflow` MCP servers. The goal is to create a single, shared `toolService` that can be configured for each server, reducing redundancy and improving maintainability.

## Acceptance Criteria

1.  A new, generic `toolService.mjs` is created in `ai/mcp/server/`.
2.  The new service is parameterized to accept a `serviceMapping` and an `openApiFilePath`.
3.  The `toolService.mjs` files in `knowledge-base` and `github-workflow` are refactored to use the new shared service.
4.  All existing functionality of both MCP servers remains unchanged and fully operational.
