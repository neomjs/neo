---
id: 9402
title: 'Performance: Eliminate Main Thread Layout Thrashing in getTargetData'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-03-08T22:27:30Z'
updatedAt: '2026-03-08T22:46:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9402'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T22:46:33Z'
---
# Performance: Eliminate Main Thread Layout Thrashing in getTargetData

**Problem:**
Profiling the Main Thread during rapid Grid scrolling reveals a massive layout thrashing penalty:
- `Recalculate style`: 38.5% total time
- `get scrollTop` & `getBoundingClientRect`: ~9% total time

This occurs because the generic `src/main/DomEvents.mjs` listener intercepts highly frequent `scroll` and `wheel` events and calls `getTargetData(target)` to build the event payload.
`getTargetData` unconditionally reads `node.getBoundingClientRect()`, `node.offsetHeight`, `node.scrollHeight`, etc., for every node in the event path.
When these reads occur immediately after the Main Thread has applied VDOM deltas (e.g., updating transforms for row recycling), the browser is forced to synchronously flush the layout queue and recalculate all styles just to return the unused `rect` data.

**Proposed Solution:**
Pass the `event.type` into `getTargetData()`.
If the event is a high-frequency continuous event that does not rely on bounding rects (specifically `scroll` and `wheel`), skip the `getBoundingClientRect()` and `offset/client/scrollHeight` reads entirely. 

This prevents forced synchronous layouts and reclaims nearly 40% of the Main Thread's blocking overhead during scrolling.

**DX Tradeoff Note:**
We must heavily document this change. Developers relying on `data.path[n].rect` inside `onScroll` handlers will now receive an empty object or null. This is an intentional architectural safeguard. If rects are truly needed during scrolling, they must be requested explicitly via `Neo.main.DomAccess.getBoundingClientRect()`.

## Timeline

- 2026-03-08T22:27:31Z @tobiu added the `enhancement` label
- 2026-03-08T22:27:31Z @tobiu added the `ai` label
- 2026-03-08T22:27:31Z @tobiu added the `performance` label
- 2026-03-08T22:36:27Z @tobiu referenced in commit `067c823` - "perf: Eliminate Main Thread Layout Thrashing in getTargetData (#9402)"
- 2026-03-08T22:36:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T22:46:14Z

**Input from Gemini 3.1 Pro:**

> ✦ **Task Completed:**
> 
> - Added `eventName` to `getTargetData` and `getSelectionPath` in `src/main/DomEvents.mjs`.
> - Implemented a fast path: If `eventName === 'scroll' || eventName === 'wheel'`, the framework no longer calls `node.getBoundingClientRect()` or reads `offsetHeight`/`scrollHeight` in `getTargetData`.
> - Retained these properties for all other events (clicks, dragging, selection) and addons (IntersectionObserver, ResizeObserver) by passing `undefined` by default.
> 
> **Benchmark Review Note:**
> Subsequent performance tracing revealed that while this successfully eliminated `getBoundingClientRect` overhead, the browser's forced synchronous layout simply shifted to the next geometric read: `node.scrollTop` (consuming 13.1% of Main Thread time). 
> 
> This confirms the necessity of this initial pruning, but also proves we need a follow-up ticket to aggressively prune `scrollTop`/`scrollLeft` reads for ancestor path elements.
> 
> Closing this ticket as the specific `getBoundingClientRect` and dimension stripping has been implemented.

- 2026-03-08T22:46:34Z @tobiu closed this issue

