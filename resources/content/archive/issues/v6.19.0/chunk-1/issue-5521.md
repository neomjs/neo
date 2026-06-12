---
id: 5521
title: 'vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnode()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-03T20:24:46Z'
updatedAt: '2024-07-03T20:31:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5521'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-03T20:31:24Z'
---
# vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnode()

Same as: https://github.com/neomjs/neo/issues/5520

For all occurrences where we query the entire tree, use the flat maps instead.

## Timeline

- 2024-07-03T20:24:46Z @tobiu added the `enhancement` label
- 2024-07-03T20:24:46Z @tobiu assigned to @tobiu
- 2024-07-03T20:31:12Z @tobiu referenced in commit `41ed238` - "vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnode() #5521"
- 2024-07-03T20:31:24Z @tobiu closed this issue

