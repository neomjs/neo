---
id: 8940
title: 'Feat: Activity Sparkline Column'
state: OPEN
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T16:44:23Z'
updatedAt: '2026-02-01T16:44:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8940'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Activity Sparkline Column

This task focuses on implementing a visual Sparkline to show activity trends over the last 15 years.

### Requirements
1.  **Component:** Create a custom `Neo.grid.column.Component` implementation that uses HTML5 Canvas (or OffscreenCanvas).
2.  **Rendering:** Draw a line chart representing the yearly contribution data (`y2010` - `y2025`).
3.  **Grid Integration:** Add this component column to the grid.

### Acceptance Criteria
- A sparkline chart appears in each row, visualizing the user's activity history.
- Scrolling performance remains high (component recycling).


## Timeline

- 2026-02-01T16:44:24Z @tobiu added the `enhancement` label
- 2026-02-01T16:44:24Z @tobiu added the `design` label
- 2026-02-01T16:44:35Z @tobiu added parent issue #8930
- 2026-02-01T16:44:54Z @tobiu assigned to @tobiu

