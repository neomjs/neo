---
id: 4637
title: 'component.Base: edge case where inside the dist mode a vdom update call gets created without having a vnode'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-04T11:43:23Z'
updatedAt: '2023-08-04T11:43:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4637'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-04T11:43:53Z'
---
# component.Base: edge case where inside the dist mode a vdom update call gets created without having a vnode

this one is a bit strange: it does not seem to happen inside the pure dev mode.

there seem to be edge cases, where a component has `mounted: true`, but does not have a vnode yet.

i will add a hotfix for now.

## Timeline

- 2023-08-04T11:43:23Z @tobiu added the `bug` label
- 2023-08-04T11:43:23Z @tobiu assigned to @tobiu
- 2023-08-04T11:43:52Z @tobiu referenced in commit `dee5478` - "component.Base: edge case where inside the dist mode a vdom update call gets created without having a vnode #4637"
- 2023-08-04T11:43:53Z @tobiu closed this issue

