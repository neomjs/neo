---
id: 8160
title: Decouple and Configure Window Detachment Thresholds in SortZone
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-27T21:00:50Z'
updatedAt: '2025-12-28T00:07:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8160'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Decouple and Configure Window Detachment Thresholds in SortZone

Currently, `Neo.draggable.container.SortZone` uses the same intersection logic (or similar 50% ratios) for both in-app item sorting (swapping items) and window detachment/re-integration. This limits UX tuning, as users often expect a "tear-off" into a new window to happen sooner (e.g., at 20% overlap) than an item swap.

**Goal:**
1.  Decouple the window detachment/re-integration thresholds from the standard sorting thresholds.
2.  Introduce specific configs (e.g., `detachThreshold: 0.2`, `reattachThreshold: 0.8`).
3.  Ensure `onDragMove` logic uses the correct threshold for the correct action (sorting vs. window boundary checks).

## Activity Log

- 2025-12-27 @tobiu added the `enhancement` label
- 2025-12-27 @tobiu added the `ai` label
- 2025-12-27 @tobiu added parent issue #8163
- 2025-12-28 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu referenced in commit `9a7d24f` - "Decouple and Configure Window Detachment Thresholds in SortZone #8160 wip"

