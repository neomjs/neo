---
title: Add Annotations to MCP Tool Definitions
labels: enhancement, AI, MCP
---

GH ticket id: #7496
**Epic:** #7378
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The MCP tool specification allows for optional `annotations` to describe tool behavior (e.g., whether an operation is mutating or safe). This metadata is valuable for AI agents to make more intelligent and safer decisions, for example by requiring stricter user confirmation for mutating actions.

This ticket covers adding support for these annotations.

## Acceptance Criteria

1.  A convention for defining annotations in `openapi.yaml` is established (e.g., a custom `x-annotations` field).
2.  At least one mutating tool (e.g., `checkout_pull_request`) is updated in `openapi.yaml` with an annotation like `{"mutating": true}`.
3.  `toolService.mjs` is refactored to parse these annotations and include them in the tool definitions.
4.  The `tools/list` response is verified to include the new `annotations` property for relevant tools.
