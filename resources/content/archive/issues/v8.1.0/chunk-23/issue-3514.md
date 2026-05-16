---
id: 3514
title: 'tab.Container: tabBarPosition: ''bottom'' & button badges'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-03T07:34:34Z'
updatedAt: '2022-10-03T07:36:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3514'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-03T07:36:26Z'
---
# tab.Container: tabBarPosition: 'bottom' & button badges

Looks like they have the same `z-index`:
<img width="546" alt="Screenshot 2022-10-03 at 09 32 55" src="https://user-images.githubusercontent.com/1177434/193523671-b2c66a56-1421-4aed-b8be-2ff6e71e4500.png">

resulting in badges getting cut off. should be an easy fix:
<img width="546" alt="Screenshot 2022-10-03 at 09 32 45" src="https://user-images.githubusercontent.com/1177434/193523738-0088c1a1-80de-46a6-9c5b-d9b31c373865.png">


## Timeline

- 2022-10-03T07:34:34Z @tobiu added the `bug` label
- 2022-10-03T07:34:34Z @tobiu assigned to @tobiu
- 2022-10-03T07:35:52Z @tobiu referenced in commit `4c35dcc` - "tab.Container: tabBarPosition: 'bottom' & button badges #3514"
- 2022-10-03T07:36:26Z @tobiu closed this issue

