---
id: 2859
title: 'calendar.view.week.Component: drag-create an event for an unchecked calendar'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-01-30T10:06:08Z'
updatedAt: '2022-01-30T10:26:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2859'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-30T10:26:15Z'
---
# calendar.view.week.Component: drag-create an event for an unchecked calendar

In case we uncheck a calendar inside the list on the left side, all events will become invisible inside the week view.

In case we drag on the week view afterwards to create a new event, we will get a JS error.

It feels cleaner in case we disable the drag-start for inactive calendars.

## Timeline

- 2022-01-30T10:06:08Z @tobiu added the `bug` label
- 2022-01-30T10:06:09Z @tobiu assigned to @tobiu
### @tobiu - 2022-01-30T10:09:54Z

this affects the logic inside `calendar.view.week.plugin.DragDrop`

- 2022-01-30T10:26:04Z @tobiu referenced in commit `182f535` - "calendar.view.week.Component: drag-create an event for an unchecked calendar #2859"
- 2022-01-30T10:26:15Z @tobiu closed this issue

