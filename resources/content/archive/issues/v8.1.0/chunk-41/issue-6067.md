---
id: 6067
title: 'component.Base: shorten the vdom & vnode component references'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-06T13:03:48Z'
updatedAt: '2024-11-06T13:04:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6067'
author: tobiu
commentsCount: 0
parentIssue: 6045
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-06T13:04:15Z'
---
# component.Base: shorten the vdom & vnode component references

currently: `{componentId: 'neo-button-1', id: 'neo-button-1'`.

we can reduce the footprint a little with only adding the id in case it differs from the componentId.

it will need some adjustments inside `vdom.Helper`.

## Timeline

- 2024-11-06T13:03:48Z @tobiu added the `enhancement` label
- 2024-11-06T13:03:48Z @tobiu assigned to @tobiu
- 2024-11-06T13:04:13Z @tobiu referenced in commit `952d36a` - "component.Base: shorten the vdom & vnode component references #6067"
- 2024-11-06T13:04:16Z @tobiu closed this issue
- 2024-11-08T13:09:16Z @tobiu referenced in commit `f035f9f` - "component.Base: shorten the vdom & vnode component references #6067"

