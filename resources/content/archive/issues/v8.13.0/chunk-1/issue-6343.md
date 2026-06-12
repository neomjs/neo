---
id: 6343
title: 'selection.grid.RowModel: update record based annotations (in case they exist) on manual selections'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-30T12:20:35Z'
updatedAt: '2025-01-30T13:30:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6343'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-30T13:30:12Z'
---
# selection.grid.RowModel: update record based annotations (in case they exist) on manual selections

@gplanansky 

We have the logic in place that annotations update the view (including run-time changes), but the other direction is missing.

This can lead to side effects:

https://github.com/user-attachments/assets/826166f7-104d-4a6f-9c01-2cc85ccc9817

=> Rich is selected as an annotation, I select Gerard manually. Re-sorting the Grid => the selection model contains Gerard, but Rich is still inside the annotations, so both get selected.

## Timeline

- 2025-01-30T12:20:35Z @tobiu added the `enhancement` label
- 2025-01-30T12:20:35Z @tobiu assigned to @tobiu
- 2025-01-30T13:28:47Z @tobiu referenced in commit `dc5a8bd` - "selection.grid.RowModel: update record based annotations (in case they exist) on manual selections #6343"
### @tobiu - 2025-01-30T13:30:12Z

https://github.com/user-attachments/assets/8854266f-4d7b-475a-bd52-68a813b7c432

clicks & key nav will now update the annotations as needed.

- 2025-01-30T13:30:12Z @tobiu closed this issue
- 2025-01-30T16:10:35Z @tobiu cross-referenced by #6347

