---
title: "Refactor Health Service to Remove Redundant Try/Catch"
labels: enhancement, AI
---

Parent epic: #7520
GH ticket id: #7514

**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

The `buildHealthResponse` function in `healthService.mjs` contains two inner `try...catch` blocks that are redundant. The empty `catch` blocks obscure the logic. This ticket is to remove them for clarity.

## Acceptance Criteria

1.  The `buildHealthResponse` function in `healthService.mjs` is updated.
2.  The two inner `try...catch` blocks are removed.
3.  The logic remains correct: if a collection doesn't exist, its `exists` flag is correctly reported as `false` and its `count` as `0`.
