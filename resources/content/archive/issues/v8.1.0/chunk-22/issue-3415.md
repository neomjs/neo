---
id: 3415
title: 'grid.Container: createColumns() => apply columnDefaults earlier'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-08-30T18:42:09Z'
updatedAt: '2022-08-30T18:42:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3415'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-08-30T18:42:41Z'
---
# grid.Container: createColumns() => apply columnDefaults earlier

locked columns check for a set `width` which could exist inside the `columnDefaults`. the same change needs to get into the table implementation.

## Timeline

- 2022-08-30T18:42:09Z @tobiu added the `enhancement` label
- 2022-08-30T18:42:09Z @tobiu assigned to @tobiu
- 2022-08-30T18:42:31Z @tobiu referenced in commit `57f8325` - "grid.Container: createColumns() => apply columnDefaults earlier #3415"
- 2022-08-30T18:42:41Z @tobiu closed this issue

