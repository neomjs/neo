---
id: 796
title: 'list.Base: createItem() => support for vdom objects'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-06-27T16:20:19Z'
updatedAt: '2020-06-27T16:24:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/796'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-27T16:24:59Z'
---
# list.Base: createItem() => support for vdom objects

right now createItemContent() is supposed to return a string.

there should be a check if the return value is a string or an object and depending on the type it should get added into html or vdom.

## Timeline

- 2020-06-27T16:20:19Z @tobiu added the `enhancement` label
- 2020-06-27T16:20:19Z @tobiu assigned to @tobiu
- 2020-06-27T16:24:53Z @tobiu referenced in commit `c85c2ac` - "list.Base: createItem() => support for vdom objects #796"
- 2020-06-27T16:24:59Z @tobiu closed this issue
- 2020-06-27T16:30:16Z @tobiu referenced in commit `5bbc134` - "list.Base: createItem() => support for vdom objects #796"

