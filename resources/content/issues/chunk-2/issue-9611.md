---
id: 9611
title: 'Grid Multi-Body: Native Vertical Scrollbar & Alignment Spacer'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-31T14:03:19Z'
updatedAt: '2026-03-31T14:07:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9611'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Native Vertical Scrollbar & Alignment Spacer

### Problem
In the Grid Multi-Body architecture, the `bodyWrapper` natively handles vertical scrolling (`overflow-y: scroll`). However, this introduced a 15px layout shift where the grid bodies become horizontally misaligned with the `headerWrapper`, which lacks a vertical scrollbar.

### Solution
1. Remove `scrollbar-width: none` from `bodyWrapper` to allow the native vertical scrollbar to be visible at the far right edge of the grid.
2. Dynamically measure the browser's native scrollbar width.
3. Inject a CSS spacer (e.g. `padding-right`) into the `headerWrapper` whenever the vertical scrollbar is active to restore perfect horizontal alignment between the headers and the cells.

This resolves the missing vertical scrollbar thumb while preserving zero-jitter native vertical compositing.

### Task List
- Modify `.neo-grid-body-wrapper` CSS.
- Calculate native scrollbar width in JS.
- Update `Header.mjs` or `Container.mjs` to inject the compensation spacer.

## Timeline

- 2026-03-31T14:03:20Z @tobiu added the `enhancement` label
- 2026-03-31T14:03:21Z @tobiu added the `ai` label
- 2026-03-31T14:03:21Z @tobiu added the `grid` label
- 2026-03-31T14:07:03Z @tobiu added parent issue #9486
- 2026-03-31T14:07:05Z @tobiu assigned to @tobiu

