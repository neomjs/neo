---
id: 9168
title: '[Grid] Optimize Runtime Buffer Updates (Phase 2: Performance)'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T12:00:42Z'
updatedAt: '2026-02-15T13:26:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9168'
author: tobiu
commentsCount: 1
parentIssue: 9165
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T13:26:24Z'
---
# [Grid] Optimize Runtime Buffer Updates (Phase 2: Performance)

After fixing the functional regression in Phase 1, we need to optimize the runtime buffer updates.
The goal is to avoid a full re-render when changing `bufferRowRange` or `bufferColumnRange`.
We should implement smarter pooling expansion/contraction to preserve existing DOM nodes where possible.

Parent Issue: #9165

## Timeline

- 2026-02-15T12:00:43Z @tobiu added the `enhancement` label
- 2026-02-15T12:00:43Z @tobiu added the `ai` label
- 2026-02-15T12:00:43Z @tobiu added the `performance` label
- 2026-02-15T12:01:31Z @tobiu assigned to @tobiu
- 2026-02-15T12:01:47Z @tobiu added parent issue #9165
- 2026-02-15T13:25:58Z @tobiu referenced in commit `09c2641` - "fix(grid): Optimize buffer updates and prevent view clipping (#9168)

Optimizes runtime buffer updates and fixes a regression where shrinking the buffer after deep scrolling caused visible rows to disappear.

Changes:
1. Grid Body:
   - 'afterSetBufferRowRange': Conditionally resynchronizes 'startIndex' with 'scrollTop' if the deviation exceeds the new buffer. This prevents stale window calculations when the buffer shrinks.
   - Removed 'force=true' from 'createViewData' calls in 'afterSetBuffer*' to enable row recycling (Phase 2 optimization).
   - Removed debug logs.

2. Tests:
   - Updated 'PoolingRuntimeUpdates.spec.mjs' with deep scrolling reproduction cases."
### @tobiu - 2026-02-15T13:26:09Z

**Input from Gemini 3 Pro:**

> ✦ Implemented performance optimizations and fixed a visibility regression.
> 
> **Changes:**
> 1.  **Optimization (Phase 2):** Removed `force=true` from buffer updates to allow row recycling, significantly reducing VDOM churn.
> 2.  **Fix:** Addressed a regression where reducing `bufferRowRange` after deep scrolling caused visible rows to vanish.
>     -   **Cause:** The `startIndex` optimization (hysteresis) could leave `startIndex` stale relative to `scrollTop`. Reducing the buffer tightened the window around this stale index, clipping current rows.
>     -   **Solution:** In `afterSetBufferRowRange`, conditionally resynchronize `startIndex` if the drift exceeds the new buffer size.
> 
> **Verification:**
> -   Updated `test/playwright/unit/grid/PoolingRuntimeUpdates.spec.mjs` with deep scrolling reproduction cases. All passed.

- 2026-02-15T13:26:24Z @tobiu closed this issue
- 2026-02-15T13:51:09Z @tobiu cross-referenced by #9169

