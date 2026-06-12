---
id: 4011
title: 'form.field.Select: picker content styles'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-02-07T21:24:26Z'
updatedAt: '2024-09-12T02:29:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4011'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:42Z'
---
# form.field.Select: picker content styles

@maxrahder @Dinkh:
The picker DOM did live inside the form field DOM node when it initially got implemented. This had some issues, in case a field lived inside a container with `overflow: hidden`. The new implementation lives directly inside `document.body`.

However, I did notice that some style rules are still living inside the `.neo-selectfield` rule and we should double-check if they still get applied as they should.

In general: a picker field should probably pass its on baseCls to the picker container, unless this is already in there.

## Timeline

- 2023-02-07T21:24:26Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:27:41Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:42Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:42Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:42Z @github-actions closed this issue

