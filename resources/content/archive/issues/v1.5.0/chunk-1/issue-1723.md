---
id: 1723
title: 'model.Component: create a smarter data variables extraction regex'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-04T14:38:00Z'
updatedAt: '2021-04-04T14:39:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1723'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-04T14:39:06Z'
---
# model.Component: create a smarter data variables extraction regex

the goal is:
1. a data variable has to start with "data"
2. it can contain 1 - infinity nested attributes, e.g. data.foo.bar
3. it must not end with a function call, e.g. data.foo.bar.toLowerCase() should result in data.foo

![Screenshot 2021-04-04 at 16 27 32](https://user-images.githubusercontent.com/1177434/113512247-0fd7c800-9564-11eb-8534-12ce1e7e1f39.png)


## Timeline

- 2021-04-04T14:38:00Z @tobiu added the `enhancement` label
- 2021-04-04T14:38:00Z @tobiu assigned to @tobiu
- 2021-04-04T14:38:53Z @tobiu referenced in commit `3ed5466` - "model.Component: create a smarter data variables extraction regex #1723"
- 2021-04-04T14:39:06Z @tobiu closed this issue

