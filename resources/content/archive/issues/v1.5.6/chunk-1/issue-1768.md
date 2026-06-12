---
id: 1768
title: 'component.Base: destroy() => model.removeBindings()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-14T10:40:46Z'
updatedAt: '2021-04-14T10:52:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1768'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T10:52:12Z'
---
# component.Base: destroy() => model.removeBindings()

we can reduce the amount of calls by probably a lot in case we check for a bind config first.

also, we can simplify the parent model access (same way as for controllers).

## Timeline

- 2021-04-14T10:40:46Z @tobiu added the `enhancement` label
- 2021-04-14T10:40:47Z @tobiu assigned to @tobiu
- 2021-04-14T10:44:27Z @tobiu referenced in commit `b80b05b` - "component.Base: destroy() => model.removeBindings() #1768"
- 2021-04-14T10:50:40Z @tobiu referenced in commit `c3b343d` - "#1768 we need to call removeBindings() on the closest parent model unrelated of destroying an own model."
- 2021-04-14T10:52:12Z @tobiu closed this issue

