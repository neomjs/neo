---
title: "Convert GitHub Workflow healthService to HealthService Neo.mjs Class"
labels: enhancement, AI, refactoring
---

GH ticket id: #7556

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/github-workflow/services/healthService.mjs` into a singleton `HealthService` class that extends `Neo.core.Base`. This is the first step in migrating the GitHub Workflow server to the consistent Neo.mjs service architecture used by the other MCP servers.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/healthService.mjs` is renamed to `HealthService.mjs`.
2.  The content is replaced with a `HealthService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `healthcheck` function is converted into a class method.
4.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `HealthService` class.
5.  The `healthcheck` tool continues to function correctly after the refactoring.
