---
title: "Convert summaryService to SummaryService Neo.mjs Class"
labels: enhancement, AI
---

GH ticket id: #7545

**Epic:** #7536
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket covers refactoring `ai/mcp/server/memory-core/services/summaryService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `SummaryService.mjs` to follow a more consistent naming convention. This service handles deleting, listing, and querying session summaries.

## Acceptance Criteria

1.  A new file `ai/mcp/server/memory-core/services/SummaryService.mjs` is created with the refactored `SummaryService` class content.
2.  The `SummaryService` class extends `Neo.core.Base` and is configured as a singleton.
3.  Existing functions (`deleteAllSummaries`, `listSummaries`, `querySummaries`) are converted into class methods.
4.  The old file `ai/mcp/server/memory-core/services/summaryService.mjs` is deleted.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `SummaryService` singleton and map its methods.
6.  Any other services that depend on `summaryService` are updated to use the new `SummaryService` singleton instance.
7.  All related tools (e.g., `delete_all_summaries`, `get_all_summaries`, `query_summaries`) continue to function correctly after the refactoring.
