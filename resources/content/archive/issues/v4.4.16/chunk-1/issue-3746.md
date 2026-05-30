---
id: 3746
title: 'container.Base: createItem() => removes default values'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-01-03T08:46:21Z'
updatedAt: '2023-01-03T08:51:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3746'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-03T08:47:48Z'
---
# container.Base: createItem() => removes default values

the check if an item has a module => removing the ntype and vice versa is getting applied to the itemDefaults object, so it will affect all following items.

we need to change this behavior to only change a shallow copy.

@Dinkh: this explains why window actions not always show up. the toolbar spacer is a `module: Component`, removes the default button ntype, actions become components and the styling is lost.

## Timeline

- 2023-01-03T08:46:22Z @tobiu added the `bug` label
- 2023-01-03T08:46:22Z @tobiu assigned to @tobiu
- 2023-01-03T08:46:39Z @tobiu referenced in commit `3825927` - "container.Base: createItem() => removes default values #3746"
- 2023-01-03T08:47:48Z @tobiu closed this issue
### @Dinkh - 2023-01-03T08:51:37Z

lets add baseCls with this ticket.


