---
title: "Centralize ChromaDB Client Warning Suppression in ChromaManager"
labels: enhancement, AI
---

GH ticket id: #7555

**Epic:** #7536
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

During the refactoring of the `knowledge-base` services, a piece of code that suppresses console warnings from the ChromaDB client was removed from the `HealthService`. This logic is a cross-cutting concern and should not live within an individual service.

This ticket covers moving the warning suppression logic into the `ChromaManager` for both the `knowledge-base` and `memory-core` servers. This will centralize the logic, remove code duplication, and ensure that all services using the manager benefit from cleaner console output.

## Acceptance Criteria

1.  The `getKnowledgeBaseCollection()` method in `ai/mcp/server/knowledge-base/services/ChromaManager.mjs` is updated to wrap the `client.getOrCreateCollection()` call with the `console.warn` suppression logic.
2.  The `getMemoryCollection()` and `getSummaryCollection()` methods in `ai/mcp/server/memory-core/services/ChromaManager.mjs` are updated to wrap their respective `client.getCollection()` or `client.getOrCreateCollection()` calls with the `console.warn` suppression logic.
3.  The `HealthService` and any other service that previously contained this logic are confirmed to no longer have it.
4.  The functionality of all related services remains unchanged, but the console output is cleaner.
