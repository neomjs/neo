---
id: 9631
title: 'Grid: Enable Horizontal Scrolling via Locked Regions'
state: OPEN
labels:
  - bug
  - ai
  - grid
assignees: []
createdAt: '2026-04-02T10:11:48Z'
updatedAt: '2026-04-02T10:11:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9631'
author: tobiu
commentsCount: 0
parentIssue: 9626
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid: Enable Horizontal Scrolling via Locked Regions

### Description
Currently, horizontal scrolling the grid via the trackpad/mousewheel only works when the pointer is hovering over the `center` region. If the pointer rests over a locked region (e.g., `left` or `right` locked columns), horizontal scrolling logic does not trigger.

Given that the horizontal scrollbar spans across all regions globally, this feels disjointed and provides a negative UX.

### Objective
Update the scroll delegation/listening architecture so that horizontal wheel/trackpad events registered inside locked regions seamlessly trigger the grid's unified horizontal scrolling mechanism.

### Context
This sub-epic is part of Epic #9626 (Unified Multi-Body Grid Scrolling).

## Timeline

- 2026-04-02T10:11:49Z @tobiu added the `bug` label
- 2026-04-02T10:11:50Z @tobiu added the `ai` label
- 2026-04-02T10:11:50Z @tobiu added the `grid` label
- 2026-04-02T10:12:05Z @tobiu added parent issue #9626

