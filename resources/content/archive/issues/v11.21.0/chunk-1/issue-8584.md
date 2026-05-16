---
id: 8584
title: Implement ResizeObserver on Ticket Summary to Drive Timeline Animation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-13T00:23:14Z'
updatedAt: '2026-01-13T10:18:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8584'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T02:14:33Z'
---
# Implement ResizeObserver on Ticket Summary to Drive Timeline Animation

Currently, expanding the ticket summary on short timelines does not trigger a container resize, causing the `TimelineCanvas` to desynchronize. The fallback `setTimeout` loop is brittle.

We will replace this with a robust, event-driven approach:
1.  **Inject ID:** Assign a stable ID (`details-{componentId}`) to the `<details>` element in the Markdown generation.
2.  **Observe:** Register `Neo.main.addon.ResizeObserver` on this ID in `afterSetMounted`.
3.  **Listen:** Add a `resize` DOM listener (delegated to `details`) in `Component.mjs`.
4.  **Update:** Fire `toggleSummary` on resize, which triggers `CanvasWrapper` to update the `TimelineCanvas`.

This ensures precise, frame-by-frame synchronization during the expansion animation.

## Timeline

- 2026-01-13T00:23:16Z @tobiu added the `enhancement` label
- 2026-01-13T00:23:16Z @tobiu added the `ai` label
- 2026-01-13T02:14:11Z @tobiu referenced in commit `9691bc8` - "#8583, #8584, removed obsolete onContentClick (edit&refresh) logic"
- 2026-01-13T02:14:33Z @tobiu closed this issue
- 2026-01-13T10:18:55Z @tobiu assigned to @tobiu

