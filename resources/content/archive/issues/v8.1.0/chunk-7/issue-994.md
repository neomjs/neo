---
id: 994
title: 'Neo.calendar.view.WeekComponent: changing the weekStartDay breaks the vdom engine'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-07-29T23:45:32Z'
updatedAt: '2020-08-15T08:43:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/994'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T08:43:19Z'
---
# Neo.calendar.view.WeekComponent: changing the weekStartDay breaks the vdom engine

pretty much a left shift of event data moving into columns to the left (switching from sunday to monday).

we should add some tests for this case.

## Timeline

- 2020-07-29T23:45:32Z @tobiu added the `enhancement` label
- 2020-07-29T23:45:32Z @tobiu assigned to @tobiu
- 2020-08-15T08:42:26Z @tobiu referenced in commit `6987fd7` - "https://github.com/neomjs/neo/issues/994"
### @tobiu - 2020-08-15T08:43:19Z

no issue with the vdom engine itself for this one. it was just the way the updates got triggered.

- 2020-08-15T08:43:19Z @tobiu closed this issue
- 2020-08-15T08:53:33Z @tobiu referenced in commit `ccf6161` - "#994 unit test"

