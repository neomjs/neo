---
id: 2556
title: 'main.mixin.DeltaUpdates: du_insertNode() Restrict the usage of vtype: text to an amount of max 20 child nodes, exclude tbody tags'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-01T15:08:52Z'
updatedAt: '2021-07-01T15:46:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2556'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-01T15:46:28Z'
---
# main.mixin.DeltaUpdates: du_insertNode() Restrict the usage of vtype: text to an amount of max 20 child nodes, exclude tbody tags

using `vtype:"text"` is intended for small components (like a div or span containing a text).

the checks should not affect the rendering performance of dom nodes with a big amount of child nodes (e.g. a table body).

## Timeline

- 2021-07-01T15:08:52Z @tobiu added the `enhancement` label
- 2021-07-01T15:08:53Z @tobiu assigned to @tobiu
- 2021-07-01T15:09:20Z @tobiu referenced in commit `9378f13` - "main.mixin.DeltaUpdates: du_insertNode() Restrict the usage of vtype: text to an amount of max 20 child nodes, exclude tbody tags #2556"
- 2021-07-01T15:46:28Z @tobiu closed this issue

