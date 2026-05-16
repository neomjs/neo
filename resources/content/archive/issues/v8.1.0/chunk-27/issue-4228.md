---
id: 4228
title: 'main.mixin.DeltaUpdates: du_insertNode() => check if the parentNode exists'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-03-31T09:49:57Z'
updatedAt: '2023-03-31T09:51:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4228'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-03-31T09:51:20Z'
---
# main.mixin.DeltaUpdates: du_insertNode() => check if the parentNode exists

i am experiencing some errors when validating form pages which got just kicked out of the DOM.

we probably need a follow-up ticket to check why not all child cmps get the new mounted state (preventing deltas), but the delta apply logic should not break in this case anyway.

## Timeline

- 2023-03-31T09:49:57Z @tobiu added the `enhancement` label
- 2023-03-31T09:49:58Z @tobiu assigned to @tobiu
- 2023-03-31T09:51:16Z @tobiu referenced in commit `9b88588` - "main.mixin.DeltaUpdates: du_insertNode() => check if the parentNode exists #4228"
- 2023-03-31T09:51:20Z @tobiu closed this issue

