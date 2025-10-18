---
title: "Convert memoryService to MemoryService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7543

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/memory-core/services/memoryService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `MemoryService.mjs` to follow a more consistent naming convention. This service handles adding, listing, and querying agent memories.

## Acceptance Criteria

1.  The file `ai/mcp/server/memory-core/services/memoryService.mjs` is renamed to `ai/mcp/server/memory-core/services/MemoryService.mjs`.
2.  The `memoryService.mjs` module is refactored into a `MemoryService` class.
3.  The `MemoryService` class extends `Neo.core.Base` and is configured as a singleton.
4.  Existing functions (`addMemory`, `listMemories`, `queryMemories`) are converted into class methods.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `MemoryService` singleton and map its methods.
6.  Any other services that depend on `memoryService` are updated to use the new `MemoryService` singleton instance.
7.  All related tools (e.g., `add_memory`, `get_session_memories`, `query_raw_memories`) continue to function correctly after the refactoring.
