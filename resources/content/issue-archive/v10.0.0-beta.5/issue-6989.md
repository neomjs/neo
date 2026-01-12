---
id: 6989
title: 'v10 component.Base: mergeConfig() => smarter vdom aggregation'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-09T00:08:40Z'
updatedAt: '2025-07-09T00:09:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6989'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-09T00:09:06Z'
---
# v10 component.Base: mergeConfig() => smarter vdom aggregation

* We can not use `Neo.merge()` here, since `vdom` contains arrays, which will get replaced

## Timeline

- 2025-07-09T00:08:40Z @tobiu assigned to @tobiu
- 2025-07-09T00:08:41Z @tobiu added the `enhancement` label
- 2025-07-09T00:09:02Z @tobiu referenced in commit `896063f` - "v10 component.Base: mergeConfig() => smarter vdom aggregation #6989"
- 2025-07-09T00:09:06Z @tobiu closed this issue
- 2025-07-09T00:10:52Z @tobiu referenced in commit `ab5fc9e` - "v10 component.Base: mergeConfig() => smarter vdom aggregation #6989"

