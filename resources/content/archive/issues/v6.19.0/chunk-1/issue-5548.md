---
id: 5548
title: 'vdom.Helper: createDeltas() => removeAll OP'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-09T17:26:29Z'
updatedAt: '2024-07-09T21:09:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5548'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-09T21:09:04Z'
---
# vdom.Helper: createDeltas() => removeAll OP

The following conditions need to be true:
1. The new vnode.childNodes array must be empty
2. The oldVnode.childNodes array must have more than one item
3. None of the oldVnode.childNodes items does exist inside the new vnode tree (map check)

If all 3 conditions match, we can replace all single `removeNode` deltas with a single `removeAll` delta.

To do this, we need to store all remove deltas of the current method call (non-recursively) and replace them as needed.

## Timeline

- 2024-07-09T17:26:30Z @tobiu added the `enhancement` label
### @tobiu - 2024-07-09T20:42:38Z

thinking more about this one:
we do not even need the check if a node did get moved, since we longer have a direct call to remove it => other OPs can still pull it out as needed.

will give it a try.

- 2024-07-09T20:42:42Z @tobiu assigned to @tobiu
- 2024-07-09T21:08:56Z @tobiu referenced in commit `63d4460` - "vdom.Helper: createDeltas() => removeAll OP #5548"
- 2024-07-09T21:09:04Z @tobiu closed this issue
- 2024-07-09T21:12:28Z @tobiu referenced in commit `94afeec` - "#5548 wrapper test comment"

