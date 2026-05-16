---
id: 121
title: 'New guide: component.Base: promise bulkConfigUpdate'
state: CLOSED
labels:
  - documentation
  - enhancement
  - stale
assignees: []
createdAt: '2019-11-28T10:44:41Z'
updatedAt: '2024-09-29T02:38:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/121'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:38:41Z'
---
# New guide: component.Base: promise bulkConfigUpdate

this new feature is incredibly powerful and deserves its own guide.

in short:
bulkConfigUpdate as a promise means:

1. lock a component for vdom updates
2. change all configs
3. trigger all afterSetConfig methods (which can change the vdom)
4. do 1 single post message from app => main => vdom worker
5. get the delta updates
6. vdom => main (apply the deltas to the real dom)
7. wait until they got applied
8. main => app (unlock the component) => resolve the promise

## Timeline

- 2019-11-28T10:44:41Z @tobiu added the `documentation` label
- 2019-11-28T10:44:41Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-15T02:36:57Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-15T02:36:58Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:38:41Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:38:41Z @github-actions closed this issue

