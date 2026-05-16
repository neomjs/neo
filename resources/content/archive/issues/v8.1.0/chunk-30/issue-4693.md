---
id: 4693
title: 'Neo: autoGenerateGetSet() => set() => avoid a deep vnode comparison'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-10T07:56:12Z'
updatedAt: '2023-08-10T07:56:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4693'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-10T07:56:43Z'
---
# Neo: autoGenerateGetSet() => set() => avoid a deep vnode comparison

vnode trees can be huge, avoid a deep comparison.

we do not need to do this for `vdom`, since it is not a real config.

## Timeline

- 2023-08-10T07:56:12Z @tobiu added the `enhancement` label
- 2023-08-10T07:56:29Z @tobiu referenced in commit `f0115d6` - "Neo: autoGenerateGetSet() => set() => avoid a deep vnode comparison #4693"
- 2023-08-10T07:56:43Z @tobiu closed this issue

