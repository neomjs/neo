---
id: 9512
title: Dynamic Value Banding Updates
state: CLOSED
labels:
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-18T14:43:45Z'
updatedAt: '2026-03-18T14:45:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9512'
author: tobiu
commentsCount: 1
parentIssue: 9511
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T14:45:25Z'
---
# Dynamic Value Banding Updates

Follow-up sub-task for #9511.
Currently, `useValueBanding_` is a reactive config on `grid.column.Base`, but it lacks the logic to trigger a recalculation when changed at run-time.
This ticket adds the missing `afterSetUseValueBanding` logic to `grid.column.Base` to resync the value banding fields and recreate the view data.
Additionally, a checkbox was added to the `valueBanding` example to demonstrate toggling the feature on the "Department" column dynamically.

## Timeline

- 2026-03-18T14:43:47Z @tobiu added the `enhancement` label
- 2026-03-18T14:43:47Z @tobiu added the `ai` label
- 2026-03-18T14:43:48Z @tobiu added the `grid` label
- 2026-03-18T14:44:14Z @tobiu referenced in commit `ef15401` - "feat(grid): Enable dynamic updates for column useValueBanding (#9512)"
- 2026-03-18T14:44:25Z @tobiu assigned to @tobiu
- 2026-03-18T14:45:00Z @tobiu added parent issue #9511
### @tobiu - 2026-03-18T14:45:13Z

Implemented via ef1540143

- 2026-03-18T14:45:25Z @tobiu closed this issue
- 2026-03-18T15:03:53Z @tobiu cross-referenced by #9513

