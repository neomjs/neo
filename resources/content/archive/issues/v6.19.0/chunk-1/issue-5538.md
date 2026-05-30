---
id: 5538
title: 'Refactor vdom.Helper: createDeltas()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-06T13:04:31Z'
updatedAt: '2024-07-06T21:35:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5538'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-06T21:35:12Z'
---
# Refactor vdom.Helper: createDeltas()

This Epic needs a new feature branch.

## Timeline

- 2024-07-06T13:04:31Z @tobiu added the `enhancement` label
- 2024-07-06T13:04:31Z @tobiu assigned to @tobiu
- 2024-07-06T13:07:22Z @tobiu referenced in commit `b169245` - "Refactor vdom.Helper: createDeltas() #5538 WIP"
- 2024-07-06T13:34:11Z @tobiu referenced in commit `6205ac4` - "#5538 vdom.Helper: createDeltas() => support for unwrapping nodes"
- 2024-07-06T19:03:18Z @tobiu referenced in commit `c24dc57` - "#5538 vdom.Helper: createDeltas() => WIP"
- 2024-07-06T19:24:44Z @tobiu referenced in commit `df2d761` - "#5538 vdom.Helper: update() => move removeNode deltas to the very end of the delta OPs"
- 2024-07-06T19:42:44Z @tobiu referenced in commit `f47ac23` - "#5538 vdom.Helper: removeNode()"
- 2024-07-06T20:13:05Z @tobiu referenced in commit `72694dd` - "#5538 vdom.Helper: insertNode() => add the new node to the old tree to simplify future OPs"
- 2024-07-06T21:00:36Z @tobiu referenced in commit `08c1489` - "#5538 vdom.Helper: createDeltas() => re-adding the edge-case for setting removeDom: true on a top-level vdom node"
- 2024-07-06T21:09:54Z @tobiu referenced in commit `6ebdaf0` - "#5538 vdom.Helper: createDeltas() => childNodes fallback arrays (vtype: 'text')"
- 2024-07-06T21:33:12Z @tobiu referenced in commit `4632ef1` - "#5538 vdom.Helper: createDeltas()"
### @tobiu - 2024-07-06T21:35:12Z

feels stable now. i will create follow up issues for the remaining "cosmetic" issues.

- 2024-07-06T21:35:12Z @tobiu closed this issue

