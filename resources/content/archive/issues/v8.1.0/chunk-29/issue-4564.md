---
id: 4564
title: 'table.View: onStoreRecordChange() => add a check if the vdom exists'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-07-25T13:46:03Z'
updatedAt: '2023-07-25T13:47:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4564'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-25T13:47:14Z'
---
# table.View: onStoreRecordChange() => add a check if the vdom exists

there can be timing issues, e.g. when a table is inside a not activated tab.

in this case, we do not need delta updates, since the initial vdom will already have the latest state.

@ki1pen 

## Timeline

- 2023-07-25T13:46:03Z @tobiu added the `bug` label
- 2023-07-25T13:46:04Z @tobiu assigned to @tobiu
- 2023-07-25T13:47:11Z @tobiu referenced in commit `00f49e7` - "table.View: onStoreRecordChange() => add a check if the vdom exists #4564"
- 2023-07-25T13:47:14Z @tobiu closed this issue

