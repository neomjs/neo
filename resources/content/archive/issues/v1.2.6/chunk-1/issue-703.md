---
id: 703
title: remote methods need to know about their app context
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-10T22:24:57Z'
updatedAt: '2020-06-14T14:58:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/703'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-14T14:58:20Z'
---
# remote methods need to know about their app context

now this one is really tricky:
<img width="238" alt="Screenshot 2020-06-11 at 00 20 46" src="https://user-images.githubusercontent.com/1177434/84324917-e0417480-ab79-11ea-9da6-fb3fc2501ec1.png">

we do want to address the "right" main thread, without manually passing it to all remote methods.

good time for a break :)

## Timeline

- 2020-06-10T22:24:57Z @tobiu added the `enhancement` label
- 2020-06-10T22:24:57Z @tobiu assigned to @tobiu
### @tobiu - 2020-06-14T14:58:20Z

implemented.

- 2020-06-14T14:58:20Z @tobiu closed this issue

