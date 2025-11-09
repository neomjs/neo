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
closedAt: '2025-10-31T21:05:41Z'
---
# Dynamic two-way scroll sync for hybrid devices

**Reported by:** @tobiu on 2025-10-31

On hybrid devices with both touch and mouse input, the grid scrollbar should support both dragging with the mouse and touch scrolling of the grid body without conflicts. This can be achieved by dynamically disabling the two-way sync during a touch interaction. This involves adding `touchstart` and `touchend` listeners to the document body to detect touch interactions and temporarily prevent the scrollbar from syncing back to the grid body during a touch scroll.

