---
title: "Implement Memory Core toolService"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7523

**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers wiring up the new `mcp-stdio.mjs` entry point to the existing memory services. This will be done by creating a local `toolService.mjs` that uses the shared `toolService` and provides the specific `serviceMapping` for the Memory Core.

## Acceptance Criteria

1.  A new `services/toolService.mjs` is created inside the `memory-core` directory.
2.  It imports the shared `toolService` from `ai/mcp/server/`.
3.  A `serviceMapping` constant is created, mapping the `operationId`s from the refactored `openapi.yaml` to the corresponding functions in the existing service files (`memoryService.mjs`, `summaryService.mjs`, etc.).
4.  The `initialize()` function of the shared `toolService` is called with the `serviceMapping` and the path to the `openapi.yaml`.
5.  The `listTools` and `callTool` functions are exported.
