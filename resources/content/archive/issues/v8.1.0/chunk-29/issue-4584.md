---
id: 4584
title: 'table.View: onStoreRecordChange only cellnode.innerHTML got update but the renderer don''t get call again'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-07-27T12:21:56Z'
updatedAt: '2023-07-28T10:19:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4584'
author: pensuwan-k
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-28T10:19:58Z'
---
# table.View: onStoreRecordChange only cellnode.innerHTML got update but the renderer don't get call again

*(No description provided)*

## Timeline

- 2023-07-27T12:21:56Z @pensuwan-k added the `bug` label
- 2023-07-27T13:00:01Z @tobiu referenced in commit `9dd7f6d` - "#4584 table.View: getColumn()"
### @tobiu - 2023-07-27T13:01:47Z

this one will take a bit longer.

`createViewData()` does several transformations with a given rendererOutput, depending on the type. we need to extract this code into a new method, which we can then use inside `onStoreRecordChange()` as well.

- 2023-07-28T10:13:10Z @tobiu referenced in commit `eca0292` - "#4584 table.View: applyRendererOutput() => used inside createViewData() & onStoreRecordChange()"
### @tobiu - 2023-07-28T10:19:58Z

the renderer logic got moved into `applyRendererOutput()`.

there is a catch though: `onStoreRecordChange()` had a specific node and was relying on getting an innerHTML string. this enabled us to trigger a delta update manually.

now a cell can contain more complex json based vdom, so that we do need to ping the vdom worker for a real update cycle. for a table view, this can be a complex operation.

strong recommendation: if you need to change multiple record fields at once, please use a bulk update via `set()` and don't change fields one by one.

i will create a new ticket for allowing partial vdom updates.

- 2023-07-28T10:19:58Z @tobiu closed this issue

