---
id: 1016
title: 'Neo.calendar.view.MonthComponent: scrolling => weekStartDate'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-01T18:38:54Z'
updatedAt: '2020-08-01T18:43:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1016'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-01T18:43:40Z'
---
# Neo.calendar.view.MonthComponent: scrolling => weekStartDate

i changed the logic to no longer save the first day of the week inside the vdom flag, in case we have the 1st of a month inside the row (week).

need to adjust the scrolling logic to honor this.

## Timeline

- 2020-08-01T18:38:54Z @tobiu added the `enhancement` label
- 2020-08-01T18:38:54Z @tobiu assigned to @tobiu
- 2020-08-01T18:43:34Z @tobiu referenced in commit `be545ab` - "Neo.calendar.view.MonthComponent: scrolling => weekStartDate #1016"
- 2020-08-01T18:43:40Z @tobiu closed this issue

