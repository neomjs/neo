---
id: 5520
title: 'vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnodeById()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-03T19:15:46Z'
updatedAt: '2024-07-03T19:27:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5520'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-03T19:27:08Z'
---
# vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnodeById()

now that we do have the flat maps in place, we can also replace this one (performance boost).

## Timeline

- 2024-07-03T19:15:46Z @tobiu added the `enhancement` label
- 2024-07-03T19:15:46Z @tobiu assigned to @tobiu
- 2024-07-03T19:26:34Z @tobiu referenced in commit `9860411` - "vdom.Helper: createDeltas() => remove VNodeUtil.findChildVnodeById() #5520"
### @tobiu - 2024-07-03T19:27:08Z

removed 2/4 occurrences. the other ones did not query the full tree, but a sub-tree.

- 2024-07-03T19:27:08Z @tobiu closed this issue
- 2024-07-03T20:24:47Z @tobiu cross-referenced by #5521

