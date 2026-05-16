---
id: 5577
title: 'worker.mixin.RemoteMethodAccess: accessing new main threads too early'
state: OPEN
labels:
  - bug
  - no auto close
assignees:
  - tobiu
createdAt: '2024-07-15T17:47:45Z'
updatedAt: '2024-10-28T12:25:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5577'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# worker.mixin.RemoteMethodAccess: accessing new main threads too early

It is an edge-case bug which does happen inside our colors app websocket demo:
![Screenshot 2024-07-15 at 19 07 46](https://github.com/user-attachments/assets/8bd79665-67be-422b-a108-8f6f7a19e941)

the app worker tries to send messages to the new main thread => loading theme files, before these remotes have been registered.

2 options:
1. debug the "app is ready" => connect event to ensure it fires once all main thread addons are ready.
2. if a namespace does not exist yet, try again 100(?)ms later

## Timeline

- 2024-07-15T17:47:45Z @tobiu added the `bug` label
- 2024-07-15T17:47:46Z @tobiu assigned to @tobiu
### @github-actions - 2024-10-14T02:36:16Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-14T02:36:17Z @github-actions added the `stale` label
### @github-actions - 2024-10-28T02:38:39Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-10-28T02:38:40Z @github-actions closed this issue
- 2024-10-28T12:24:25Z @tobiu reopened this issue
- 2024-10-28T12:24:39Z @tobiu removed the `stale` label
- 2024-10-28T12:24:39Z @tobiu added the `no auto close` label
### @tobiu - 2024-10-28T12:25:01Z

this one must not auto close.


