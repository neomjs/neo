---
id: 5892
title: 'main.addon.Navigator: subscribe() sometimes gets called without a matching element'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-12T20:55:37Z'
updatedAt: '2024-09-21T12:36:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5892'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T12:36:10Z'
---
# main.addon.Navigator: subscribe() sometimes gets called without a matching element

<img width="617" alt="Screenshot 2024-09-12 at 22 54 42" src="https://github.com/user-attachments/assets/d6c1fc25-263f-4ad7-9ffb-296afe0af59b">

we should at least add a check if the target node exists and if not skip the following logic.

## Timeline

- 2024-09-12T20:55:37Z @tobiu added the `enhancement` label
- 2024-09-12T20:55:37Z @tobiu assigned to @tobiu
- 2024-09-21T12:36:04Z @tobiu referenced in commit `ae007e4` - "main.addon.Navigator: subscribe() sometimes gets called without a matching element #5892"
- 2024-09-21T12:36:10Z @tobiu closed this issue

