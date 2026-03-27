---
id: 9317
title: Optimize DOM hot path DeltaUpdates to reduce GC pressure
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T22:00:20Z'
updatedAt: '2026-02-26T22:02:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9317'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T22:02:18Z'
---
# Optimize DOM hot path DeltaUpdates to reduce GC pressure

This ticket covers a set of optimizations in the hot path of DOM updates (`src/main/DeltaUpdates.mjs` and `src/main/render/DomApiRenderer.mjs`).

The main thread can process batches of 600+ deltas at a time. The previous implementations relied on `Array.from().find()` for NodeLists and `Object.entries().forEach()` for object iteration, which creates significant garbage collection (GC) pressure due to intermediate array allocations and closure creation.

**Changes:**
1. Replaced `Array.from(childNodes).find(...)` with standard `for` loops in `DeltaUpdates.mjs` (`getFragmentNodes`, `removeNode`, `updateVtext`).
2. Replaced `Object.entries(delta).forEach(...)` with `for...in` loops in `DeltaUpdates.updateNode` and `DomApiRenderer.createDomTree` for attributes and styles.
3. Removed a duplicate `getFragmentNodes` method from `DeltaUpdates.mjs`.

These changes should yield a measurable reduction in memory allocations and frame drops during intense update phases.

## Timeline

- 2026-02-26T22:00:22Z @tobiu added the `enhancement` label
- 2026-02-26T22:00:22Z @tobiu added the `ai` label
- 2026-02-26T22:01:44Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T22:01:52Z

**Input from Gemini 3.1 Pro:**

> ✦ The optimizations have been successfully implemented and pushed to the `dev` branch.
> 
> - Replaced all instances of `Array.from().find()` with `for` loops in `DeltaUpdates.mjs` to eliminate array allocations.
> - Replaced `Object.entries().forEach()` with `for...in` loops in `updateNode` and `DomApiRenderer.createDomTree` to avoid temporary arrays and closures.
> - Removed the duplicate `getFragmentNodes` method in `DeltaUpdates.mjs`.
> 
> These changes should significantly reduce GC pressure in the main thread during heavy DOM update operations. Closing this ticket.

- 2026-02-26T22:02:07Z @tobiu referenced in commit `29b95b1` - "perf: Optimize DOM hot path DeltaUpdates to reduce GC pressure (#9317)"
- 2026-02-26T22:02:18Z @tobiu closed this issue

