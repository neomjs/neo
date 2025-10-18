---
title: "Convert sessionService to SessionService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7544

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/memory-core/services/sessionService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `SessionService.mjs` to follow a more consistent naming convention. This service handles summarizing agent sessions.

## Acceptance Criteria

1.  The file `ai/mcp/server/memory-core/services/sessionService.mjs` is renamed to `ai/mcp/server/memory-core/services/SessionService.mjs`.
2.  The `sessionService.mjs` module is refactored into a `SessionService` class.
3.  The `SessionService` class extends `Neo.core.Base` and is configured as a singleton.
4.  Existing functions (`summarizeSessions`, `SessionSummarizer`'s methods) are converted into class methods or integrated into the `SessionService` class.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `SessionService` singleton and map its methods.
6.  Any other services that depend on `sessionService` are updated to use the new `SessionService` singleton instance.
7.  All related tools (e.g., `summarize_sessions`) continue to function correctly after the refactoring.
