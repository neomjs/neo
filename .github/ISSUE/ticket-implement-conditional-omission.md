---
title: Implement Conditional Omission of Optional Fields in MCP Tool Definitions
labels: enhancement, AI
---

GH ticket id: #
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The MCP specification defines several optional fields in tool definitions (e.g., `outputSchema`, `annotations`). To ensure strict compliance and avoid sending `null` values for absent optional fields, this ticket implements conditional omission of these fields from the `tools/list` response.

## Acceptance Criteria

1.  `toolService.mjs` is modified such that `buildOutputZodSchema` returns `null` when no output schema is found.
2.  `toolService.mjs` is modified such that `outputSchema` is only included in the `allToolsForListing` array if `outputJsonSchema` is not `null`.
3.  `toolService.mjs` is modified such that `annotations` is only included in the `allToolsForListing` array if `operation['x-annotations']` is not `null`.
4.  The `tools/list` response correctly omits `outputSchema` and `annotations` when they are not present.
