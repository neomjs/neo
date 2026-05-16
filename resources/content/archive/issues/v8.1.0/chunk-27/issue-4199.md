---
id: 4199
title: Cookie add-on issue with nonexistent cookies
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-03-23T10:27:10Z'
updatedAt: '2023-03-23T11:05:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4199'
author: Ghost
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-23T11:05:22Z'
---
# Cookie add-on issue with nonexistent cookies

**Describe the bug**
A JS error occurs when using the `getCookie` method of the `Cookie` add-on, if no cookie corresponding the given parameter is found.

**To Reproduce**
Steps to reproduce the behavior:
1. Import `Cookie` add-on.
2. Call `getCookie` method providing a cookie name which doesn't exist.

**Expected behavior**
`null` is returned for not found cookies.

**Screenshots**
![image](https://user-images.githubusercontent.com/126246513/227174810-147086f0-13ba-42e9-802b-e3d3aed8d07c.png)

## Timeline

- 2023-03-23T10:27:10Z @Ghost added the `bug` label
- 2023-03-23T11:00:40Z @Ghost cross-referenced by PR #4202
- 2023-03-23T11:05:22Z @tobiu closed this issue

