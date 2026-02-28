---
id: 9319
title: Optimize Grid hot paths to reduce GC pressure
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T22:08:35Z'
updatedAt: '2026-02-26T22:13:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9319'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T22:13:26Z'
---
# Optimize Grid hot paths to reduce GC pressure

This ticket optimizes the hot paths within the buffered grid to reduce GC pressure and improve scrolling/rendering performance. 

The Grid's virtual scrolling mechanism relies heavily on iterating over rows, columns, and cell components. Using `.forEach()` with inline arrow functions in these tight loops allocates arrays (like `Object.values()`) and closures repeatedly. 

**Changes:**
1. `src/grid/Body.mjs`: Replaced `.forEach()` loops with highly efficient `for` loops, particularly in hot paths like `onStoreRecordChange`, `getColumnCells`, and config setters that iterate over `me.items`.
2. `src/grid/Row.mjs`: Replaced `Object.values(me.components).forEach()` with `for...in` loops to avoid intermediate array allocations and closures during component state updates and destruction. Refactored `.forEach` on `oldCn` to a standard `for` loop during cell VDOM recycling.
3. `src/grid/Container.mjs`: Replaced `.forEach` in `createColumns`, `bulkUpdateRecords`, and `removeSortingCss` with `for` loops.

These optimizations are crucial for maintaining 60fps scrolling performance, especially when rapidly recycling rows with many cell components.

## Timeline

- 2026-02-26T22:08:36Z @tobiu added the `enhancement` label
- 2026-02-26T22:08:36Z @tobiu added the `ai` label
- 2026-02-26T22:12:29Z @tobiu referenced in commit `457b7a9` - "perf: Optimize Grid hot paths to reduce GC pressure (#9319)"
- 2026-02-26T22:12:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T22:12:39Z

**Input from Gemini 3.1 Pro:**

> ✦ The grid hot path optimizations have been successfully implemented, and a syntax error (`len is not defined`) has been fixed. Changes have been pushed to `dev`.
> 
> Key changes:
> 1. `src/grid/Body.mjs`: Replaced all `.forEach()` loops iterating over `me.items` with highly efficient standard `for` loops. This affects config setters, `destroy()`, `getColumnCells`, and `onStoreRecordChange`.
> 2. `src/grid/Row.mjs`: Replaced `Object.values(this.components).forEach()` with `for...in` loops to avoid allocating arrays of values and closures during component state updates (`afterSetMounted`, `afterSetTheme`, `updateCellComponents`) and destruction. Refactored the `.forEach` on `oldCn` to a standard `for` loop in `createVdom` recycling.
> 3. `src/grid/Container.mjs`: Converted `.forEach` iterations in `bulkUpdateRecords`, `createColumns`, and `removeSortingCss` to standard `for` loops.
> 
> These changes should significantly reduce GC pressure during rapid grid scrolling and rendering. Closing this ticket.

- 2026-02-26T22:13:27Z @tobiu closed this issue

