---
id: 9318
title: Optimize VDom Helper hot paths to reduce GC pressure
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T22:03:50Z'
updatedAt: '2026-02-26T22:06:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9318'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T22:06:49Z'
---
# Optimize VDom Helper hot paths to reduce GC pressure

This ticket continues the GC pressure reduction effort, focusing on the VDOM worker's hot paths (`src/vdom/Helper.mjs` and `src/vdom/VNode.mjs`).

The VDom Worker can generate thousands of delta updates. Array allocations and closures inside looping constructs create significant GC pressure. 

**Changes:**
1. Replaced `Object.keys().forEach()` and `Object.entries().forEach()` with `for...in` loops in `Helper.compareAttributes` and `Helper.createVnode`.
2. Refactored `.forEach` loops on child arrays to use standard `for` loops in `Helper.createVnodeMap`, `Helper.findMovedNodes`, and `Helper.getFragmentPhysicalCount`.
3. Optimized `normalizeClassName` in `VNode.mjs` to avoid `.filter(Boolean)` and `.forEach` closures.
4. Converted `Object.entries().forEach()` to `for...in` in `Helper.updateBatch`.

These optimizations will make the VDOM generation and diffing process much lighter on memory allocations.

## Timeline

- 2026-02-26T22:03:51Z @tobiu added the `enhancement` label
- 2026-02-26T22:03:51Z @tobiu added the `ai` label
- 2026-02-26T22:06:11Z @tobiu referenced in commit `dc13a71` - "perf: Optimize VDom Helper hot paths to reduce GC pressure (#9318)"
- 2026-02-26T22:06:15Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T22:06:18Z

**Input from Gemini 3.1 Pro:**

> ✦ The optimizations for the VDOM worker hot paths have been implemented and pushed to `dev`.
> 
> Key changes:
> 1. `Helper.mjs`: Replaced `Object.keys().forEach` and `Object.entries().forEach` with `for...in` loops in `compareAttributes` and `createVnode` to avoid array allocations and closure overhead.
> 2. `Helper.mjs`: Refactored `.forEach` on `childNodes` arrays into `for` loops in `createVnodeMap`, `findMovedNodes`, and `getFragmentPhysicalCount`.
> 3. `Helper.mjs`: Changed `Object.entries().forEach` to `for...in` in `updateBatch`.
> 4. `VNode.mjs`: Optimized `normalizeClassName` to use plain `for` loops instead of `.forEach` and `.filter(Boolean)`.
> 
> Closing this ticket.

- 2026-02-26T22:06:49Z @tobiu closed this issue

