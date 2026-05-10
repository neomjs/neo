---
id: 9623
title: 'Grid Multi-Body: Fix .neo-last-column border styling logic across multiple bodies'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-04-01T20:03:22Z'
updatedAt: '2026-04-01T20:25:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9623'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-01T20:25:02Z'
---
# Grid Multi-Body: Fix .neo-last-column border styling logic across multiple bodies

### Problem
The `.neo-last-column` CSS class removes the right border of a grid column because the Grid Container itself provides the bounding border. In the single-body architecture, this was correctly applied to the single rightmost column.

With the introduction of the multi-body architecture, `isLastColumn` evaluates to `true` for the last column of *each* sub-grid body (`bodyStart`, `body`, and `bodyEnd`). As a result, all three bodies were rendering a `.neo-last-column` without a right border, causing missing vertical dividers between sections.

### Solution
Updated the `isLastColumn` logic in `src/grid/Row.mjs` to evaluate the *global* grid layout rather than just the local sub-grid count:
- **locked: 'start'**: Only gets `.neo-last-column` if there are no center columns and no end columns.
- **center**: Only gets `.neo-last-column` if there are no end columns.
- **locked: 'end'**: Always receives `.neo-last-column` (as it represents the absolute rightmost boundary).

## Timeline

- 2026-04-01T20:03:23Z @tobiu added the `bug` label
- 2026-04-01T20:03:23Z @tobiu added the `ai` label
- 2026-04-01T20:03:23Z @tobiu added the `grid` label
- 2026-04-01T20:03:31Z @tobiu added parent issue #9486
- 2026-04-01T20:05:35Z @tobiu referenced in commit `d275916` - "fix: Fix .neo-last-column CSS logic across multiple sub-grids (#9623)

In the multi-body architecture, the rightmost column locally stored within each sub-grid (Start, Center, End) was incorrectly evaluating as 'isLastColumn' and receiving the .neo-last-column class (which stripped its right border). The classification has been mapped directly to the global grid geometry, bounding the border removal rule specifically to strictly the true last column."
- 2026-04-01T20:25:00Z @tobiu assigned to @tobiu
- 2026-04-01T20:25:02Z @tobiu closed this issue

