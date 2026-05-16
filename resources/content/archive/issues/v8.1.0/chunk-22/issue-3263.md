---
id: 3263
title: '`create-class` script `adjustView(..)` inserts new configs in wrong place in the file on Windows'
state: CLOSED
labels:
  - bug
  - windows
  - stale
assignees: []
createdAt: '2022-07-04T14:57:51Z'
updatedAt: '2024-09-13T02:30:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3263'
author: davhm
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:30:10Z'
---
# `create-class` script `adjustView(..)` inserts new configs in wrong place in the file on Windows

**Describe the bug**
See screenshot

**Expected behavior**
The config should be created in the correct place (sorted alphabetically inside the `getConfig(..)` (like on MacOS) instead of **at the very top of the file** (which seems to be the current behavior).

**Screenshots**
![image](https://user-images.githubusercontent.com/105657166/177179231-269fd1af-dd3d-4abb-9a61-8d067696ff08.png)



## Timeline

- 2022-07-04T14:57:51Z @davhm added the `bug` label
- 2022-07-04T15:04:39Z @davhm added the `windows` label
### @github-actions - 2024-08-30T02:28:00Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:28:01Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:30:10Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:30:10Z @github-actions closed this issue

