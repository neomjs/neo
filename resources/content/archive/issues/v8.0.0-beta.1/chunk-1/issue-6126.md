---
id: 6126
title: 'calendar.view.EditEventContainer: onFocusLeave()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-11-21T10:35:02Z'
updatedAt: '2024-11-21T20:32:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6126'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-21T20:32:00Z'
---
# calendar.view.EditEventContainer: onFocusLeave()

![Image](https://github.com/user-attachments/assets/d27fa826-4f0d-4fd0-92a4-401dac4adabd)

* When clicking on a TimeField trigger, the entire dialog will close instantly
* This is a regression issue (did work fine before)
* The dialog will not close in case we click on the ColorField trigger

needs some investigation

## Timeline

- 2024-11-21T10:35:02Z @tobiu added the `bug` label
- 2024-11-21T10:35:02Z @tobiu assigned to @tobiu
- 2024-11-21T20:24:01Z @tobiu referenced in commit `b0ed160` - "calendar.view.EditEventContainer: onFocusLeave() #6126"
- 2024-11-21T20:32:00Z @tobiu closed this issue

