---
id: 5255
title: 'form.field.Select: afterSetRecord() => removing old values from selections'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-02-20T11:14:59Z'
updatedAt: '2024-02-20T11:27:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5255'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-20T11:27:54Z'
---
# form.field.Select: afterSetRecord() => removing old values from selections

old code:
```
    afterSetRecord(value, oldValue) {
        let me             = this,
            list           = me.list,
            selectionModel = list?.selectionModel,
            valueField     = me.valueField,
            nodeId;

        if (oldValue) {
            nodeId = list?.getItemId(oldValue[valueField]);

            selectionModel?.deselect(nodeId);
        }

        if (value) {
            nodeId = list?.getItemId(value[valueField]);

            selectionModel?.select(nodeId);
        }
    }
```

new code:
```
    afterSetRecord(value, oldValue) {
        if (this._picker?.isVisible) {
            let me             = this,
                selectionModel = me.list?.selectionModel;

            if (value) {
                selectionModel?.select(value);
            }
            else {
                selectionModel.deselectAll();
            }
        }
    }
```

we need a merge of both. if we are switching from one record to another, the old selection should get removed (i would not assume that the selModel has singleSelection activated).

if there is no value, we need the deselectAll() call.

@ExtAnimal 

## Timeline

- 2024-02-20T11:14:59Z @tobiu added the `bug` label
- 2024-02-20T11:15:00Z @tobiu assigned to @tobiu
- 2024-02-20T11:18:21Z @tobiu referenced in commit `1666ce2` - "form.field.Select: afterSetValue() => removing old values from selections #5255"
- 2024-02-20T11:27:45Z @tobiu changed title from **form.field.Select: afterSetValue() => removing old values from selections** to **form.field.Select: afterSetRecord() => removing old values from selections**
- 2024-02-20T11:27:54Z @tobiu closed this issue
- 2024-03-26T16:29:34Z @tobiu referenced in commit `934fa83` - "form.field.Select: afterSetValue() => removing old values from selections #5255"

