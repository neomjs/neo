---
id: 5734
title: 'component.wrapper.AmChart: destroy() => dispose chart instance'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-10T11:16:31Z'
updatedAt: '2024-08-10T11:17:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5734'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-10T11:17:53Z'
---
# component.wrapper.AmChart: destroy() => dispose chart instance

potential memory leak.

while we are already disposing chart instances on unmount, it does not happen yet on destroy.

![Screenshot 2024-08-10 at 13 15 12](https://github.com/user-attachments/assets/608d97d2-b86a-4faf-a5d6-6ab25b8ff50e)


## Timeline

- 2024-08-10T11:16:31Z @tobiu added the `enhancement` label
- 2024-08-10T11:16:31Z @tobiu assigned to @tobiu
- 2024-08-10T11:16:52Z @tobiu referenced in commit `8ddaf92` - "component.wrapper.AmChart: destroy() => dispose chart instance #5734"
- 2024-08-10T11:17:53Z @tobiu closed this issue

