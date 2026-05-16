---
id: 2346
title: 'calendar.view.month.Component: show the event edit form on event double-click'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-11T10:14:36Z'
updatedAt: '2021-06-11T17:06:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2346'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-11T17:06:38Z'
---
# calendar.view.month.Component: show the event edit form on event double-click

This ticket is an epic. I will create sub-tickets.

Ideally, the entire calendar app will only create one editor instance.

To make this happen, the "owner" needs to be the MainContainer.

This one needs the relevant configs (e.g. minimum event duration, timeFormat).

## Timeline

- 2021-06-11T10:14:36Z @tobiu added the `enhancement` label
- 2021-06-11T10:14:36Z @tobiu assigned to @tobiu
- 2021-06-11T10:27:40Z @tobiu referenced in commit `68e7dd0` - "#2346 calendar.view.MainContainer: endTime_, startTime_"
- 2021-06-11T10:34:45Z @tobiu referenced in commit `9c5cbcc` - "#2346 calendar.view.settings.GeneralContainer: endTime, startTime controls"
- 2021-06-11T10:53:43Z @tobiu referenced in commit `36b2c60` - "#2346 calendar.view.MainContainer: afterSetEndTime(), afterSetStartTime() logic"
- 2021-06-11T11:45:45Z @tobiu referenced in commit `1d7179a` - "#2346 PoC to get the event edit dialog working inside the week view, while the instance is bound to the MainContainer"
- 2021-06-11T16:38:56Z @tobiu referenced in commit `fc2f821` - "#2346 calendar.view.month.Component: onEventDoubleClick() => editor positioning logic"
- 2021-06-11T17:05:30Z @tobiu referenced in commit `56581f1` - "#2346 calendar.view.month.Component: added more fixed ids to greatly improve the delta updates logic"
- 2021-06-11T17:06:38Z @tobiu closed this issue

