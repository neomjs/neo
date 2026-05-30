---
id: 3116
title: 'vdom.Helper: createDeltas() => enhance the logic for re-sorting arrays'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-05-30T20:13:41Z'
updatedAt: '2022-05-30T20:16:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3116'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-30T20:16:00Z'
---
# vdom.Helper: createDeltas() => enhance the logic for re-sorting arrays

This item is tricky, since there are many edge cases to be aware of.

In case we re-sort an array and some items stay at the "same" index, the vdom engine does not think that there is a need for a change. However, in case we add or remove items in front of an array item which should stay at the same index, it can interfere with items which get moved as well, leading to a broken order.

We want to achieve:
1. An array of items which does not get any index changes should not get any deltas
2. `vdom.cn.unshift(vdom.cn.pop());` should only create one delta.
3. The resulting order has to be correct, even in case some items stay at the same index.
4. The amount of move OPs (deltas) needs to be minimal.

I think we can do this with just one line of magic :)

## Timeline

- 2022-05-30T20:13:41Z @tobiu added the `enhancement` label
- 2022-05-30T20:13:42Z @tobiu assigned to @tobiu
- 2022-05-30T20:14:51Z @tobiu referenced in commit `be46754` - "vdom.Helper: createDeltas() => enhance the logic for re-sorting arrays #3116"
- 2022-05-30T20:16:01Z @tobiu closed this issue

