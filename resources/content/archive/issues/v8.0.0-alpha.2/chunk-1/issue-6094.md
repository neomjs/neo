---
id: 6094
title: 'calendar.view.calendars.Container: onAddCalendarButtonClick()'
state: CLOSED
labels:
  - bug
  - no auto close
assignees: []
createdAt: '2024-11-08T15:19:56Z'
updatedAt: '2024-11-11T08:24:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6094'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-11T08:24:14Z'
---
# calendar.view.calendars.Container: onAddCalendarButtonClick()

There is currently a bug (also in v7):
![Image](https://github.com/user-attachments/assets/3ef9acd6-68f8-4b2e-b623-17527bbfef04)

When adding a new item, the next item gets a double label.

There are too many update calls, but it might even be related to the vdom Engine.

We need to create a new test case and further investigate this one.

## Timeline

- 2024-11-08T15:19:56Z @tobiu added the `bug` label
- 2024-11-08T15:20:06Z @tobiu added the `no auto close` label
- 2024-11-11T08:23:57Z @tobiu referenced in commit `84b697e` - "calendar.view.calendars.Container: onAddCalendarButtonClick() #6094"
- 2024-11-11T08:24:14Z @tobiu closed this issue

