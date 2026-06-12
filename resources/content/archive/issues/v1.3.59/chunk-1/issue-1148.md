---
id: 1148
title: 'component.Base: beforeGetWrapperStyle()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T23:37:19Z'
updatedAt: '2020-08-28T23:37:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1148'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T23:37:41Z'
---
# component.Base: beforeGetWrapperStyle()

to be less restrictive, merge the wrapperStyle with already existing styles on the top level vdom node.

wrapperStyle will get a higher prio.

we also want to return a shallow copy to make changing values easier.

## Timeline

- 2020-08-28T23:37:19Z @tobiu added the `enhancement` label
- 2020-08-28T23:37:20Z @tobiu assigned to @tobiu
- 2020-08-28T23:37:38Z @tobiu referenced in commit `56b0a6e` - "component.Base: beforeGetWrapperStyle() #1148"
- 2020-08-28T23:37:41Z @tobiu closed this issue

