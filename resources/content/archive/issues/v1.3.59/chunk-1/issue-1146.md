---
id: 1146
title: 'layout.Flexbox: applyChildAttributes() => wrapperStyle'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T21:59:33Z'
updatedAt: '2020-08-28T22:00:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1146'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T22:00:11Z'
---
# layout.Flexbox: applyChildAttributes() => wrapperStyle

the method is using component.style instead of wrapperStyle.

was created before wrapperStyle even existed.

obviously we always want flex values to get applied to the top level node.

## Timeline

- 2020-08-28T21:59:33Z @tobiu added the `enhancement` label
- 2020-08-28T21:59:34Z @tobiu assigned to @tobiu
- 2020-08-28T22:00:07Z @tobiu referenced in commit `452a782` - "layout.Flexbox: applyChildAttributes() => wrapperStyle #1146"
- 2020-08-28T22:00:11Z @tobiu closed this issue

