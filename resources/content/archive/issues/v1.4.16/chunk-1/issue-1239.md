---
id: 1239
title: 'util.VDom: getParentNodes()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-12T09:50:38Z'
updatedAt: '2020-10-12T10:13:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1239'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-12T10:13:42Z'
---
# util.VDom: getParentNodes()

we need to walk the vdom tree "upwards", which is a bit tricky.

it should return an array of all matches, sorted from bottom to top inside the tree path.

component.Base: getTheme() needs this one.

## Timeline

- 2020-10-12T09:50:38Z @tobiu added the `enhancement` label
- 2020-10-12T09:50:38Z @tobiu assigned to @tobiu
- 2020-10-12T10:13:27Z @tobiu referenced in commit `3a8260c` - "util.VDom: getParentNodes() #1239"
- 2020-10-12T10:13:42Z @tobiu closed this issue

