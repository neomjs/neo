---
id: 2233
title: 'calendar.view.WeekComponent: onColumnDrag*'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-02T17:01:23Z'
updatedAt: '2021-06-02T17:13:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2233'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-02T17:13:27Z'
---
# calendar.view.WeekComponent: onColumnDrag*

we need to adjust the check to only accept drag targets which are top level columns (excluding events and event resize handles).

## Timeline

- 2021-06-02T17:01:23Z @tobiu added the `enhancement` label
- 2021-06-02T17:01:23Z @tobiu assigned to @tobiu
- 2021-06-02T17:01:40Z @tobiu referenced in commit `00b2eea` - "calendar.view.WeekComponent: onColumnDrag* #2233"
### @tobiu - 2021-06-02T17:12:57Z

we should add a new method for the check.

- 2021-06-02T17:13:22Z @tobiu referenced in commit `b7d1b9b` - "calendar.view.WeekComponent: onColumnDrag* #2233"
- 2021-06-02T17:13:27Z @tobiu closed this issue

