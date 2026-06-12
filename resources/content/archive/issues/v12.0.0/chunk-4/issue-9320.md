---
id: 9320
title: Optimize VDom Lifecycle and TreeBuilder hot paths to reduce GC pressure
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T22:14:29Z'
updatedAt: '2026-02-26T22:17:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9320'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T22:17:17Z'
---
# Optimize VDom Lifecycle and TreeBuilder hot paths to reduce GC pressure

This ticket addresses GC pressure optimizations within the core VDOM management files: `src/manager/VDomUpdate.mjs`, `src/mixin/VdomLifecycle.mjs`, and `src/util/vdom/TreeBuilder.mjs`.

The VDOM update lifecycle naturally deals with recursive tree building, queueing, and callback execution. By converting standard `.forEach` array iterations and `Map.prototype.forEach` iterations to `for` loops, `for...in` loops, and `for...of` loops, we can avoid creating closures and temporary arrays during high-frequency update cycles.

**Changes:**
1. `src/manager/VDomUpdate.mjs`: Refactored `forEach` methods used on Maps (`item.children.forEach`, `this.descendantInFlightMap.forEach`) into `for...of` loops (`for (const [key, value] of map)`). Replaced array `.forEach` calls with `for` loops in `executePromiseCallbacks`, `registerInFlightUpdate`, and `triggerPostUpdates`.
2. `src/mixin/VdomLifecycle.mjs`: Replaced `Object.keys(updates).forEach`, `Object.entries(response.vnodes).forEach`, and other array `.forEach` calls (like in `syncVnodeTree` and `executeVdomUpdate`) with `for...in` or standard `for` loops.
3. `src/util/vdom/TreeBuilder.mjs`: Converted `node[childKey].forEach(item => ...)` to a standard `for` loop in the recursive `#buildTree` method to avoid closure allocations at every node depth.

## Timeline

- 2026-02-26T22:14:30Z @tobiu added the `enhancement` label
- 2026-02-26T22:14:30Z @tobiu added the `ai` label
- 2026-02-26T22:16:43Z @tobiu referenced in commit `9961615` - "perf: Optimize VDom Lifecycle and TreeBuilder hot paths to reduce GC pressure (#9320)"
- 2026-02-26T22:16:49Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T22:16:55Z

**Input from Gemini 3.1 Pro:**

> ✦ The GC pressure optimizations in the VDOM lifecycle components have been successfully implemented and pushed to `dev`.
> 
> Key changes:
> 1. `src/manager/VDomUpdate.mjs`: Replaced all usages of array `.forEach` and `Map.prototype.forEach` with `for` and `for...of` loops, including heavily used iteration paths in `triggerPostUpdates`, `registerInFlightUpdate`, and callback execution.
> 2. `src/mixin/VdomLifecycle.mjs`: Replaced `.forEach` loops inside `executeVdomUpdate` (`Object.keys`, `Object.entries`) and `syncVnodeTree` with `for...in` and standard `for` loops.
> 3. `src/util/vdom/TreeBuilder.mjs`: Refactored the core recursive `#buildTree` method to use a standard `for` loop instead of `node[childKey].forEach()`, eliminating closure overhead at every level of the recursive tree walk.
> 
> These optimizations will ensure that high-frequency VDOM update requests cause significantly less GC thrashing. Closing this ticket.

- 2026-02-26T22:17:17Z @tobiu closed this issue

