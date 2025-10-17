---
title: "Refactor dbService to use chromaManager"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7526

**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

Currently, `dbService.mjs` creates its own ChromaDB client, which is redundant with the centralized `chromaManager.mjs` used by other services. This ticket is to refactor `dbService` to use the shared `chromaManager` for consistency and efficiency.

## Acceptance Criteria

1.  `dbService.mjs` is updated to import `chromaManager`.
2.  The local `getMemoryCollection` helper function in `dbService.mjs` is removed.
3.  The `exportDatabase` and `importDatabase` functions are updated to use `chromaManager.getMemoryCollection()` and `chromaManager.getSummaryCollection()`.
4.  The `exportDatabase` function is enhanced to support exporting both `memories` and `summaries` collections.
5.  The functionality of the import/export tools remains correct.
