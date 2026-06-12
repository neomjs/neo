---
id: 1141
title: 'component.Base: updateStyle() => no need to sync the vnode tree'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T19:22:05Z'
updatedAt: '2020-08-28T19:38:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1141'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T19:38:29Z'
---
# component.Base: updateStyle() => no need to sync the vnode tree

a style update won't change the structure, so we can remove the tree sync (performance).

## Timeline

- 2020-08-28T19:22:05Z @tobiu added the `enhancement` label
- 2020-08-28T19:22:06Z @tobiu assigned to @tobiu
- 2020-08-28T19:38:22Z @tobiu referenced in commit `21055a5` - "component.Base: updateStyle() => no need to sync the vnode tree #1141"
- 2020-08-28T19:38:29Z @tobiu closed this issue

