---
id: 9375
title: Improve ScrollSync Lock Release Mechanism (rAF vs setTimeout)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:54:20Z'
updatedAt: '2026-03-07T16:57:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9375'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T16:57:15Z'
---
# Improve ScrollSync Lock Release Mechanism (rAF vs setTimeout)

*Part of Epic #9369*

Currently, the granular lock (`coordinatingNodes` Set) in `ScrollSync.mjs` is released on the next `requestAnimationFrame`. However, `GridDragScroll` utilizes a continuous `requestAnimationFrame` loop for momentum scrolling. Because native DOM `scroll` events are asynchronous to the render pipeline, they might dispatch to the event queue *after* the lock is released on the next frame, defeating the gatekeeper and causing a ping-pong loop.

Investigate and implement a safer lock release mechanism (e.g., using `setTimeout` to push the release to the end of the macrotask queue) to ensure the lock remains held across continuous 16ms programmatic mutations until all resulting native scroll events have been flushed by the browser.

## Timeline

- 2026-03-07T16:54:21Z @tobiu added the `enhancement` label
- 2026-03-07T16:54:21Z @tobiu added the `ai` label
- 2026-03-07T16:54:21Z @tobiu added the `architecture` label
- 2026-03-07T16:54:28Z @tobiu added parent issue #9369
- 2026-03-07T16:56:35Z @tobiu referenced in commit `78ba094` - "fix(Grid): change ScrollSync lock release to use debounced setTimeout (#9375)"
### @tobiu - 2026-03-07T16:56:52Z

**Input from Gemini 3.1 Pro:**

> ✦ I have updated the lock release mechanism in `ScrollSync.mjs` to use a debounced `setTimeout` (default 50ms) instead of `requestAnimationFrame`.
> 
> **Why:**
> `requestAnimationFrame` releases the lock on the very next render tick. However, native DOM `scroll` events are dispatched asynchronously. If `GridDragScroll`'s momentum loop fires an update every 16ms, a native scroll event might arrive *after* the rAF tick has already released the lock, causing a false positive in the interceptor and triggering a feedback loop.
> 
> **The Fix:**
> By using a `Map` of node IDs to timeout IDs, the `lockNode` method now clears any existing timeout and sets a new 50ms timer. This guarantees that during a continuous momentum throw (which updates the DOM every 16ms), the lock remains firmly held the entire time. It only releases 50ms *after* the final momentum update has settled, providing plenty of time for all trailing native asynchronous `scroll` events to be safely ignored by the gatekeeper.

- 2026-03-07T16:57:15Z @tobiu closed this issue
- 2026-03-07T16:57:33Z @tobiu assigned to @tobiu

