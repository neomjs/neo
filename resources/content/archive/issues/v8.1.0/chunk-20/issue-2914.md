---
id: 2914
title: 'worker.ServiceBase: createMessageChannel()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-03-03T21:15:26Z'
updatedAt: '2022-03-03T22:17:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2914'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-03-03T22:17:21Z'
---
# worker.ServiceBase: createMessageChannel()

*(No description provided)*

## Timeline

- 2022-03-03T21:15:26Z @tobiu added the `enhancement` label
- 2022-03-03T21:15:26Z @tobiu assigned to @tobiu
- 2022-03-03T21:15:45Z @tobiu referenced in commit `17ea2e8` - "worker.ServiceBase: createMessageChannel() #2914"
### @tobiu - 2022-03-03T22:08:46Z

We need to change channelPorts to be an array, implement a `getPort()` method and only assign a new last target, in case it has a source to stop messages getting piped through `main`.

<img width="806" alt="Screenshot 2022-03-03 at 23 06 32" src="https://user-images.githubusercontent.com/1177434/156660985-fb76ce02-ea68-4dcc-9988-0ee0feeea2cf.png">


- 2022-03-03T22:16:40Z @tobiu referenced in commit `458889a` - "worker.ServiceBase: createMessageChannel() #2914"
- 2022-03-03T22:17:21Z @tobiu closed this issue

