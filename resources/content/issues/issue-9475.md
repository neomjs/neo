---
id: 9475
title: 'Grid: Remove `#initialChunkSize` DOM pooling bypass & fix pool shrink bug'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-03-14T12:34:15Z'
updatedAt: '2026-03-14T12:36:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9475'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T12:36:25Z'
---
# Grid: Remove `#initialChunkSize` DOM pooling bypass & fix pool shrink bug

### The Problem

1.  **The Shrink Bug:** In #9474, the `GridBody#createRowPool` logic was updated to cap the pool size based on `store.count`. However, this aggressively destroyed DOM nodes when a Store was filtered (e.g. from 100 items down to 2), completely breaking the virtual scroller's "Fixed-DOM-Order" strategy which requires unused nodes to be recycled and hidden via `display: none` rather than destroyed.
2.  **The Chunking Bypass:** When a data chunk was loaded (`store.add(items, false)` with `initialChunkSize`), the grid bypassed pooling and attempted to render the entire chunk into the DOM at once to provide "immediate scrollability".

### The Solution

1.  **Prevent Pool Shrinkage:** Updated `createRowPool()` to `Math.min(windowSize, Math.max(me.items.length, countRecords))`. The pool will grow to accommodate data (up to the viewport size limit), but it will *never* shrink during filtering operations, preserving existing DOM nodes for instant reuse when the filter is cleared.
2.  **Remove Chunking Bypass:** Completely removed `#initialChunkSize` usage from `GridBody`. The grid now correctly utilizes standard row pooling (rendering only the viewport range) during a chunked load. Immediate scrollability is fully preserved because `#initialTotalSize` is still used to immediately size the scroll container bounds accurately.

## Timeline

- 2026-03-14T12:34:17Z @tobiu added the `enhancement` label
- 2026-03-14T12:34:17Z @tobiu added the `ai` label
- 2026-03-14T12:34:17Z @tobiu added the `architecture` label
- 2026-03-14T12:34:17Z @tobiu added the `grid` label
- 2026-03-14T12:35:48Z @tobiu referenced in commit `c457d06` - "fix(grid): Prevent DOM node destruction on filter and remove chunking bypass (#9475)"
- 2026-03-14T12:35:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-14T12:36:09Z

**Input from Gemini 3.1 Pro:**

> ✦ The bug preventing "Fixed-DOM-Order" during filtering has been resolved. The `#initialChunkSize` pooling bypass has also been entirely removed from the grid body, meaning chunked data loads will now properly undergo virtualization. The test suite is passing again.

- 2026-03-14T12:36:26Z @tobiu closed this issue

