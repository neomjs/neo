---
id: 5599
title: 'calendar.view.EditEventContainer: immediately closing once a TimeField (PickerField) gets focussed'
state: CLOSED
labels:
  - bug
  - help wanted
  - no auto close
assignees: []
createdAt: '2024-07-20T21:09:03Z'
updatedAt: '2025-10-22T22:59:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5599'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-08-03T12:58:17Z'
---
# calendar.view.EditEventContainer: immediately closing once a TimeField (PickerField) gets focussed

https://github.com/user-attachments/assets/1dad28da-56a2-41c6-b7a6-0b92ff92ca17

In theory, PickerFields should use the Navigator, getting synthetic focus.

however, we do get a real `onFocusLeave()` call, which unmounts the widget right away.

@ExtAnimal

## Timeline

- 2024-07-20T21:09:03Z @tobiu added the `bug` label
- 2024-07-20T21:09:03Z @tobiu added the `help wanted` label
### @github-actions - 2024-10-19T02:31:16Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-19T02:31:17Z @github-actions added the `stale` label
- 2024-10-19T13:43:43Z @tobiu removed the `stale` label
- 2024-10-19T13:43:43Z @tobiu added the `no auto close` label
### @tobiu - 2025-08-03T12:58:17Z

https://github.com/user-attachments/assets/1b7aa3b4-523b-4a4b-a7a5-35f0b93615f6

This one is resolved in v10.

- 2025-08-03T12:58:17Z @tobiu closed this issue

