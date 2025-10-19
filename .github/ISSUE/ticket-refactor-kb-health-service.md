---
title: "Refactor HealthService to Match Superior Memory Core Pattern"
labels: enhancement, AI
---

GH ticket id: #7553

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/knowledge-base/services/healthService.mjs` into a singleton `HealthService` class. The current implementation is a simple function; it should be upgraded to match the more robust and informative pattern established in the `memory-core` server's `HealthService` (`ai/mcp/server/memory-core/services/HealthService.mjs`).

## Acceptance Criteria

1.  The file `ai/mcp/server/knowledge-base/services/healthService.mjs` is renamed to `HealthService.mjs`.
2.  The content is replaced with a `HealthService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The `healthcheck` function is converted into a class method (e.g., `buildHealthResponse`).
4.  The new class uses the `DatabaseLifecycleService` and `ChromaManager` to get the database status, instead of creating its own Chroma client.
5.  The health check response is enhanced to include more details, such as uptime and version, mirroring the `memory-core` service.
6.  The `ai/mcp/server/knowledge-base/services/toolService.mjs` is updated to use the new `HealthService` class and its method.
7.  The `healthcheck` tool continues to function correctly with the improved response structure.
