---
id: 9152
title: '[DevIndex] Add Hireable and Website columns to Grid'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-14T13:04:44Z'
updatedAt: '2026-02-14T16:40:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9152'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [DevIndex] Add Hireable and Website columns to Grid

Add `Hireable` and `Website` columns to the main grid in DevIndex.
- `Hireable`: Boolean icon column. Position near generic icon/link columns.
- `Website`: Link column.
- Create generic `Neo.component.Icon` and `Neo.grid.column.Icon` to support these and future icon-based columns efficiently (pooling).
- Create generic `Neo.component.IconLink` and `Neo.grid.column.IconLink` to support these and future icon-link-based columns efficiently (pooling).
- Refactor existing icon columns (like LinkedIn) to use the new generic implementation if applicable.
- The new components need their own `scss` files and support for the `neo-dark` and `neo-light` theme based on theme variables. Avoid inline styles.

## Timeline

- 2026-02-14T13:04:45Z @tobiu added the `enhancement` label
- 2026-02-14T13:04:45Z @tobiu added the `ai` label
- 2026-02-14T13:05:00Z @tobiu added parent issue #9106
- 2026-02-14T16:38:58Z @tobiu assigned to @tobiu
- 2026-02-14T16:41:14Z @tobiu referenced in commit `870c145` - "[DevIndex] Add Hireable and Website columns to Grid #9152 wip"

