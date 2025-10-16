---
title: "Bug: healthcheck tool returns unstructured content"
labels: bug, AI
---

Parent epic: #7501
GH ticket id: #7514

**Phase:** 4 (Bugfix)
**Assignee:** tobiu
**Status:** To Do

## Description

When running the `healthcheck` tool on the `neo-knowledge-base` MCP server, it fails with the error: `MCP error -32600: Tool healthcheck has an output schema but did not return structured content`.

This indicates that the object returned by the `healthService.healthcheck` function does not match the `HealthCheckResponse` schema defined in `openapi.yaml`.

## Acceptance Criteria

1.  The `healthService.mjs` file is reviewed and corrected.
2.  The `healthcheck` function is modified to return a JSON object that strictly conforms to the `HealthCheckResponse` schema.
3.  Running the `healthcheck` tool successfully returns the structured health status without any MCP errors.
