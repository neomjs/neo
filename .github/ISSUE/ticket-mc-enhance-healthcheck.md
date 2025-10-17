---
title: "Enhance Memory Core Health Check"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7525

**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket is to improve the `healthcheck` tool for the `memory-core` server to match the more comprehensive implementation of the `knowledge-base` server. This involves updating the `healthService.mjs` to check for the existence and status of both the `memories` and `summaries` collections, and updating the `openapi.yaml` to reflect the richer response schema.

## Acceptance Criteria

1.  The `buildHealthResponse` function in `ai/mcp/server/memory-core/services/healthService.mjs` is updated.
2.  The health check now verifies the existence and document count of both the `memories` and `summaries` collections.
3.  The `HealthCheckResponse` schema in `ai/mcp/server/memory-core/openapi.yaml` is updated to include the detailed database and collection status, matching the structure of the knowledge-base server's schema.
4.  A successful health check call returns the new, richer status object.
