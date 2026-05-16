---
id: 2366
title: 'component.Base: set() => only trigger a vdom update if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-15T00:16:08Z'
updatedAt: '2021-06-15T00:16:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2366'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-15T00:16:57Z'
---
# component.Base: set() => only trigger a vdom update if needed

while `set()` is intended for bulk config updates resulting in just 1 vdom update engine call at the end, there are cases where you only update non vdom related configs.

one example is `model.Component` which calls set on config changes.

the new logic need to track if the vdom of the cmp actually needs an update or not.

## Timeline

- 2021-06-15T00:16:08Z @tobiu added the `enhancement` label
- 2021-06-15T00:16:08Z @tobiu assigned to @tobiu
- 2021-06-15T00:16:51Z @tobiu referenced in commit `86c40da` - "component.Base: set() => only trigger a vdom update if needed #2366"
- 2021-06-15T00:16:57Z @tobiu closed this issue

