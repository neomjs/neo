---
id: 3782
title: HighlightJS resources
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-04T20:39:38Z'
updatedAt: '2024-09-14T02:26:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3782'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:17Z'
---
# HighlightJS resources

right now, we have the resources twice inside the repo, which is not good for maintenance and package file size.

the current approach breaks inside the dist modes:
<img width="1791" alt="Screenshot 2023-01-04 at 21 28 48" src="https://user-images.githubusercontent.com/1177434/210645513-61328a35-0134-426f-963d-6b31c7444010.png">

since the top level resources folder does get copied into dist already, we should move the files there.

@Dinkh 

## Timeline

- 2023-01-04T20:39:38Z @tobiu added the `bug` label
### @github-actions - 2024-08-30T02:27:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:17Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:17Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:17Z @github-actions closed this issue

