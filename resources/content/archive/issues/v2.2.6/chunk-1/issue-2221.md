---
id: 2221
title: Create a PoC for a direct communication between the App and Data workers
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-01T05:53:16Z'
updatedAt: '2021-06-01T12:14:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2221'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-01T12:14:29Z'
---
# Create a PoC for a direct communication between the App and Data workers

Peter and Rodney gave me a heads up on this one inside the working draft podcast yesterday:
https://developer.mozilla.org/en-US/docs/Web/API/Channel_Messaging_API

I was not aware, that we can pass ports through post messages.

In short: so far the communication between App and Data always pass through a main thread. This is a pain point and not needed. I was planning to resolve it once sub-workers are implemented, but we can probably do this right now.

Idea: Once the data worker is created, it creates a `new MessageChannel()`. It sends its `port2` through main to the app worker. From there on, the app worker can use this port to directly send messages.

Follow up ticket: if the PoC works out fine, the data worker could always be a dedicated worker (even for multi window apps).

## Timeline

- 2021-06-01T05:53:16Z @tobiu added the `enhancement` label
- 2021-06-01T05:53:17Z @tobiu assigned to @tobiu
- 2021-06-01T07:28:06Z @tobiu referenced in commit `cec8a05` - "https://github.com/neomjs/neo/issues/2221"
- 2021-06-01T11:18:23Z @tobiu referenced in commit `28669b9` - "#2221 worker.Base: workerPorts config"
- 2021-06-01T11:21:31Z @tobiu referenced in commit `94302e2` - "#2221 worker.App: registering the Data port, worker.Data: registering the App port"
- 2021-06-01T12:13:42Z @tobiu referenced in commit `7243992` - "Create a PoC for a direct communication between the App and Data workers #2221"
### @tobiu - 2021-06-01T12:14:29Z

![Screenshot 2021-06-01 at 14 12 24](https://user-images.githubusercontent.com/1177434/120321499-ab2ab680-c2e3-11eb-905d-262ac527020f.png)


- 2021-06-01T12:14:29Z @tobiu closed this issue

