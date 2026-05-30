---
id: 1330
title: 'draggable.DragProxyComponent: increase the priority for position: absolute'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-28T11:17:47Z'
updatedAt: '2020-10-28T11:20:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1330'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-28T11:20:27Z'
---
# draggable.DragProxyComponent: increase the priority for position: absolute

e.g. adding a dragProxyConfig like:

```
dragProxyConfig: {
    cls: ['neo-dragproxy', 'neo-tree-list']
}
```

should not require devs to pick the order inside the opposite way (tree-list is using position: relative).

one of the few use cases, where we need the !important flag.

## Timeline

- 2020-10-28T11:17:47Z @tobiu added the `enhancement` label
- 2020-10-28T11:17:48Z @tobiu assigned to @tobiu
- 2020-10-28T11:20:19Z @tobiu referenced in commit `6ad120f` - "draggable.DragProxyComponent: increase the priority for position: absolute #1330"
- 2020-10-28T11:20:27Z @tobiu closed this issue

