---
id: 9149
title: 'DevIndex: Add Total Contributions label to StatusToolbar'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T23:14:52Z'
updatedAt: '2026-02-13T23:26:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9149'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T23:26:52Z'
---
# DevIndex: Add Total Contributions label to StatusToolbar

This task updates the `DevIndex.view.home.StatusToolbar` to include a new "Total Contributions" label.

### Changes:
1.  **Rename `updateRowsLabel` to `updateRowsLabels`**: Reflecting the fact that it now manages multiple labels.
2.  **Add Total Contributions Label**: A new label displaying the summed contributions.
3.  **Turbo Mode Support**: The summation logic handles both `Neo.data.Record` instances (via `totalContributions` field) and raw data objects (via `tc` property) to support the store's lazy instantiation mode.
4.  **Separator**: Added a bullet `•` separator between the Total Contributions and Visible Rows labels.
5.  **Positioning**: Placed Total Contributions *before* Visible Rows for better visual hierarchy.

This enhancement provides researchers and users with immediate aggregate data on the currently filtered view.


## Timeline

- 2026-02-13T23:14:53Z @tobiu added the `enhancement` label
- 2026-02-13T23:14:53Z @tobiu added the `ai` label
- 2026-02-13T23:24:13Z @tobiu added parent issue #9106
- 2026-02-13T23:24:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-13T23:24:54Z

**Input from Gemini 3 Pro:**

> ✦ I have updated the `StatusToolbar` to include the Total Contributions label.
> - Renamed `updateRowsLabel` to `updateRowsLabels`.
> - Implemented the summation logic to handle both raw objects (Turbo Mode) and Record instances.
> - Added a `•` separator and positioned the new label before the row count.
> - Optimized the code using destructuring shorthands.

- 2026-02-13T23:26:38Z @tobiu referenced in commit `43874d8` - "feat(devindex): Add Total Contributions label to StatusToolbar (#9149)"
- 2026-02-13T23:26:52Z @tobiu closed this issue

