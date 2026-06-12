---
id: 7683
title: Dynamic two-way scroll sync for hybrid devices
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-31T20:24:50Z'
updatedAt: '2025-10-31T21:05:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7683'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-31T21:05:41Z'
---
# Dynamic two-way scroll sync for hybrid devices

On hybrid devices with both touch and mouse input, the grid scrollbar should support both dragging with the mouse and touch scrolling of the grid body without conflicts. This can be achieved by dynamically disabling the two-way sync during a touch interaction. This involves adding `touchstart` and `touchend` listeners to the document body to detect touch interactions and temporarily prevent the scrollbar from syncing back to the grid body during a touch scroll.

## Timeline

- 2025-10-31T20:24:52Z @tobiu added the `enhancement` label
- 2025-10-31T20:24:52Z @tobiu added the `epic` label
- 2025-10-31T20:24:52Z @tobiu added the `ai` label
- 2025-10-31T20:57:58Z @tobiu assigned to @tobiu
- 2025-10-31T21:05:28Z @tobiu referenced in commit `c2ac86d` - "Dynamic two-way scroll sync for hybrid devices #7683"
- 2025-10-31T21:05:36Z @tobiu removed the `epic` label
- 2025-10-31T21:05:41Z @tobiu closed this issue

