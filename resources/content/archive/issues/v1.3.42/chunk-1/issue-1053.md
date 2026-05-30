---
id: 1053
title: 'Calendar Week View: moving an event into a column on the right breaks the vdom engine'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-08-13T16:32:05Z'
updatedAt: '2020-08-13T16:33:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1053'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-13T16:33:54Z'
---
# Calendar Week View: moving an event into a column on the right breaks the vdom engine

A bit of an edge case, but it is obviously supposed to work.

<img width="982" alt="Screenshot 2020-08-13 at 18 21 13" src="https://user-images.githubusercontent.com/1177434/90160852-9a2fa980-dd92-11ea-9430-88b92930ebd8.png">

We move an event from one column into a column to the right.
Columns have their own child arrays.
We also add a new CSS class.

idea:
<img width="769" alt="Screenshot 2020-08-13 at 18 20 14" src="https://user-images.githubusercontent.com/1177434/90160963-c0554980-dd92-11ea-8b00-447e1ac9dfb4.png">

We check the old tree, if the node exists there. If so, we move the real dom of the node to the new spot.

Now this is the part, which is a bit hack-ish (feels smart though).
While we can not touch the new vnode (would just break the state completely),
we actually put the node into the new spot, just inside the old tree.

This way, the delta comparisons of the old and new node will happen out of the box.

It is an expensive search task, but reduces the work once the engine arrives at the modified child array:
We do not get additional index changes, since the arrays are in sync.

The change did not break any other test cases, but needs some testing.

## Timeline

- 2020-08-13T16:32:05Z @tobiu added the `bug` label
- 2020-08-13T16:32:06Z @tobiu assigned to @tobiu
- 2020-08-13T16:33:05Z @tobiu referenced in commit `c92908f` - "Calendar Week View: moving an event into a column on the right breaks the vdom engine #1053"
- 2020-08-13T16:33:54Z @tobiu closed this issue

