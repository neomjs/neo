---
id: 1703
title: 'container.Base: insert() => trigger model.resolveBindings(item) if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-01T12:11:45Z'
updatedAt: '2021-04-01T12:20:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1703'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-01T12:20:34Z'
---
# container.Base: insert() => trigger model.resolveBindings(item) if needed

in case the item has no own model, but parent model(s), we need to trigger `resolveBindings()` on the closest parent model after the `Neo.create()` call.

at this point, the item is already fully constructed, so we don't need a listener on the `constructed` event.

## Timeline

- 2021-04-01T12:11:45Z @tobiu added the `enhancement` label
- 2021-04-01T12:11:45Z @tobiu assigned to @tobiu
- 2021-04-01T12:12:10Z @tobiu referenced in commit `7f800d1` - "container.Base: insert() => trigger model.resolveBindings(item) if needed #1703"
- 2021-04-01T12:20:34Z @tobiu closed this issue

