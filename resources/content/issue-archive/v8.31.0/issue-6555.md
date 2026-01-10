---
id: 6555
title: 'grid.View: createViewData() => updateVdom param'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-03-09T14:32:56Z'
updatedAt: '2025-03-09T17:17:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6555'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-09T17:17:56Z'
---
# grid.View: createViewData() => updateVdom param

For `grid.plugin.AnimateRows` we need a way to get the next vdom state without actually creating it.

It would be way too expensive to even manually iterate over all records (imaging 50k rows).

## Timeline

- 2025-03-09 @tobiu added the `enhancement` label
- 2025-03-09 @tobiu referenced in commit `6f6a597` - "grid.View: createViewData() => updateVdom param #6555"
- 2025-03-09 @tobiu closed this issue
### @tobiu - 2025-03-09 17:17

I need to revert this one, since it would still trigger cell renderers. For component based columns => index shift => update cycle. Got a smarter strategy already.

- 2025-03-09 @tobiu reopened this issue
- 2025-03-09 @tobiu referenced in commit `ddf28a0` - "#6555 reverted the change in favor of a smarter solution"
- 2025-03-09 @tobiu closed this issue
- 2025-03-09 @tobiu cross-referenced by #6557

