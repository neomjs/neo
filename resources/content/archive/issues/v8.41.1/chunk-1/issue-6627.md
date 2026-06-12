---
id: 6627
title: 'examples.calendar.basic.MainContainerController: smarter theme switching'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-07T09:34:04Z'
updatedAt: '2025-04-07T09:35:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6627'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-07T09:35:32Z'
---
# examples.calendar.basic.MainContainerController: smarter theme switching

* Using the `theme` config of the MainContainer
* `container.Base` needs to use `theme` as a default value inside `createItem()`
* `calendar.view.MainContainer` needs to delegate the theme to `editCalendarContainer` & `editEventContainer`

## Timeline

- 2025-04-07T09:34:04Z @tobiu added the `enhancement` label
- 2025-04-07T09:34:04Z @tobiu assigned to @tobiu
- 2025-04-07T09:34:28Z @tobiu referenced in commit `5b9656f` - "examples.calendar.basic.MainContainerController: smarter theme switching #6627"
- 2025-04-07T09:35:33Z @tobiu closed this issue

