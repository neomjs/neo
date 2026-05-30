---
id: 1495
title: Setting a worker title (name) for the chrome dev tools
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-01-21T13:52:13Z'
updatedAt: '2021-01-21T14:01:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1495'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-01-21T14:01:09Z'
---
# Setting a worker title (name) for the chrome dev tools

not super important, but it would be nice if we can show a name here:

![Screenshot 2021-01-21 at 14 49 57](https://user-images.githubusercontent.com/1177434/105359878-3b4f4580-5bf8-11eb-994d-0f6c672d7124.png)


## Timeline

- 2021-01-21T13:52:13Z @tobiu added the `enhancement` label
- 2021-01-21T13:59:40Z @tobiu referenced in commit `d1a32f9` - "Setting a worker title (name) for the chrome dev tools #1495"
### @tobiu - 2021-01-21T14:01:09Z

this looks better.

![Screenshot 2021-01-21 at 14 59 18](https://user-images.githubusercontent.com/1177434/105360819-4ce51d00-5bf9-11eb-8990-2c432b17c94c.png)

unfortunately, we can not set the name inside the worker instance, e.g.
`self.name = "neomjs-app-worker"` (like it works for onconnect), but have to specify it inside the worker creation opts.

- 2021-01-21T14:01:09Z @tobiu closed this issue

