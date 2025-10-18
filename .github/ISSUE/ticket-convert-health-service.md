---
title: "Convert healthService to HealthService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7542

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/memory-core/services/healthService.mjs` into a singleton class that extends `Neo.core.Base`. This service is responsible for providing the health status of the memory core server.

## Acceptance Criteria

1.  The `healthService.mjs` module is refactored into a `HealthService` class.
2.  The `HealthService` class extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `buildHealthResponse` function is converted into a class method.
4.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `HealthService` singleton and map its methods.
5.  Any other services that depend on `healthService` are updated to use the new `HealthService` singleton instance.
6.  The `neo-memory-core__healthcheck` tool continues to function correctly after the refactoring.
