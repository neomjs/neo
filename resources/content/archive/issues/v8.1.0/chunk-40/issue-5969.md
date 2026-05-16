---
id: 5969
title: 'data.RecordFactory: add support for change notifications for nested fields'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-26T17:49:28Z'
updatedAt: '2024-09-26T21:34:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5969'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-26T21:34:41Z'
---
# data.RecordFactory: add support for change notifications for nested fields

use case:
```
{
    annotations: {
        selected: true
    }
}
```

=> `myRecord.annotations.selected = false` => notify the `data.Store`

## Timeline

- 2024-09-26T17:49:28Z @tobiu added the `enhancement` label
- 2024-09-26T17:49:28Z @tobiu assigned to @tobiu
- 2024-09-26T18:19:48Z @tobiu referenced in commit `fc67458` - "#5969 copying the table.container example"
- 2024-09-26T18:26:03Z @tobiu referenced in commit `6e39114` - "#5969 examples.table.nestedRecordFields: using a normal viewport as the base class"
- 2024-09-26T18:31:53Z @tobiu referenced in commit `02abdb8` - "#5969 examples.table.nestedRecordFields.MainModel: using nested fields"
- 2024-09-26T19:05:44Z @tobiu referenced in commit `bb09d20` - "#5969 examples.table.nestedRecordFields.MainContainer: cleanup for the edit action renderer"
- 2024-09-26T19:41:07Z @tobiu referenced in commit `7168821` - "#5969 examples.table.nestedRecordFields.MainContainer: edit button => changing a nested field (statically for now)"
- 2024-09-26T19:53:13Z @tobiu referenced in commit `ca55d2f` - "#5969 data.RecordFactory: createField() => extracted the logic from the class constructor"
- 2024-09-26T20:56:16Z @tobiu referenced in commit `3f3aade` - "#5969 data.RecordFactory: createField() => adjusted to support nested fields"
- 2024-09-26T21:33:05Z @tobiu referenced in commit `0a7362a` - "#5969 data.RecordFactory: createField() => only generate fields in case there are no direct child fields, storing symbols inside the lowest level"
- 2024-09-26T21:34:41Z @tobiu closed this issue
- 2024-09-27T09:54:00Z @tobiu referenced in commit `aefc3b6` - "#5969 examples.table.nestedRecordFields.EditUserDialog"
- 2024-09-27T09:59:00Z @tobiu referenced in commit `a9dc981` - "#5969 examples.table.nestedRecordFields.EditUserDialog: cleanup"
- 2024-09-27T10:00:53Z @tobiu referenced in commit `99bc5ba` - "#5969 examples.table.nestedRecordFields.EditUserDialog: modal true"
- 2024-09-27T10:07:16Z @tobiu referenced in commit `c91be35` - "#5969 examples.table.nestedRecordFields.MainModel: nested annotations field"
- 2024-09-27T10:55:40Z @tobiu referenced in commit `5700ff4` - "#5969 examples.table.nestedRecordFields.EditUserDialog: selected row checkbox"
- 2024-09-27T11:16:57Z @tobiu referenced in commit `8b2c9a8` - "#5969 examples.table.nestedRecordFields.MainContainerModel including countries store"
- 2024-09-27T12:28:29Z @tobiu referenced in commit `eca64dc` - "#5969 examples.table.nestedRecordFields.MainStore: replaced country names with codes inside the store data"
- 2024-09-27T12:29:20Z @tobiu referenced in commit `f961b9e` - "#5969 examples.table.nestedRecordFields.MainContainerModel: moved the table store into the vm, onCountryStoreLoad() listener"
- 2024-09-27T12:30:17Z @tobiu referenced in commit `06c1b98` - "#5969 examples.table.nestedRecordFields.MainContainer: using the new VM based store, countryRenderer()"
- 2024-09-27T12:30:50Z @tobiu referenced in commit `d782b12` - "#5969 examples.table.nestedRecordFields.EditUserDialog: country field get & set logic"

