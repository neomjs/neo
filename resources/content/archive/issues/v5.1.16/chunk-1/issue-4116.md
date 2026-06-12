---
id: 4116
title: 'component.Base: render() => delete vdom.removeDom'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-21T13:09:27Z'
updatedAt: '2023-02-21T13:13:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4116'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-21T13:13:42Z'
---
# component.Base: render() => delete vdom.removeDom

it can cause issues otherwise when dynamically changing the `hidden` config.
<img width="681" alt="Screenshot 2023-02-21 at 13 56 47" src="https://user-images.githubusercontent.com/1177434/220353440-88dafe93-cad6-451b-91a0-7bd2db54dba3.png">

@Dinkh


## Timeline

- 2023-02-21T13:09:27Z @tobiu added the `bug` label
- 2023-02-21T13:09:28Z @tobiu assigned to @tobiu
- 2023-02-21T13:11:22Z @tobiu referenced in commit `3789504` - "component.Base: render() => delete vdom.removeDom #4116"
- 2023-02-21T13:13:42Z @tobiu closed this issue

