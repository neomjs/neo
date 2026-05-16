---
id: 5002
title: 'table.View: applyRendererOutput() => switch from align to cellAlign'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-10-10T11:43:21Z'
updatedAt: '2023-10-10T11:51:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5002'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-10T11:51:35Z'
---
# table.View: applyRendererOutput() => switch from align to cellAlign

align is now reserved for component.Base => floating components.

`table.header.Button` already changed the internal config from `align` to `cellAlign`, but it was not honored inside the `table.View` logic.

## Timeline

- 2023-10-10T11:43:21Z @tobiu added the `bug` label
- 2023-10-10T11:43:21Z @tobiu assigned to @tobiu
- 2023-10-10T11:51:33Z @tobiu referenced in commit `4ae195a` - "table.View: applyRendererOutput() => switch from align to cellAlign #5002"
- 2023-10-10T11:51:35Z @tobiu closed this issue
- 2023-10-10T15:46:49Z @tobiu referenced in commit `a8a82a6` - "v6.8.2 (#5004)

* Focus trap (#5001)

* Tighten up tabbable test

* table.View: applyRendererOutput() => switch from align to cellAlign #5002

* form.field.Date: FF input icon => replace clip-path with a negative margin #5003

* dependencies update

* v6.8.2"

