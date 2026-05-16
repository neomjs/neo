---
id: 5529
title: 'vdom.Helper: createDeltas() => support for infinite scrolling is broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-04T20:51:50Z'
updatedAt: '2024-07-04T20:52:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5529'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-04T20:52:31Z'
---
# vdom.Helper: createDeltas() => support for infinite scrolling is broken

It took me many hours to figure this one out.

The bug is related to introducing flat maps for reducing the amount of tree parsings.

However, there are a couple of spots (inserting, moving or removing an item from an array), where we did modify the old vnode tree. fair game, since it will get deleted anyway.

As a result, the indexes & items inside the old flat map were no longer fully in sync.

Changing the indexes inside a map feels expensive: getting a node & parent node is easy, but for getting all items of the same parent, we need to walk through the entire map.

So, for now, I just recreated the old map for those edge-cases. Should be roughly the same performance-wise.

## Timeline

- 2024-07-04T20:51:50Z @tobiu added the `bug` label
- 2024-07-04T20:51:50Z @tobiu assigned to @tobiu
- 2024-07-04T20:52:28Z @tobiu referenced in commit `a08f7e5` - "vdom.Helper: createDeltas() => support for infinite scrolling is broken #5529"
- 2024-07-04T20:52:31Z @tobiu closed this issue

