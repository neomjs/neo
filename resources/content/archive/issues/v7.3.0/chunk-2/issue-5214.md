---
id: 5214
title: 'form.field.Select: onFocusLeave() no longer clearing values with forceSelection'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2024-02-12T14:01:30Z'
updatedAt: '2024-09-12T02:28:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5214'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:30Z'
---
# form.field.Select: onFocusLeave() no longer clearing values with forceSelection

The bug occured inside our client app and needs investigation.

The new logic seems wrong: if the widget is using the `forceSelection` config, non matching values need to get cleared. Without the config, arbitrary entries are allowed and must not get cleared.

```
    onFocusLeave(data) {
        let me = this;

        if (!me.record) {
            if (me.forceSelection) {
                me.value = me.forceSelection ? me.activeRecordId : null;
            }
            // If we exit without selecting a record, clear the filter input value.
            else {
                me.getInputEl().value = '';
            }
        }

        // Clear any typeahead hint
        me.updateTypeAheadValue('');

        // The VDOM must not carry the empty string permanently. Only while clearing the value.
        if (!me.record && !me.forceSelection) {
            delete me.getInputEl().value;
        }

        super.onFocusLeave(data)
    }
```

@ExtAnimal 

## Timeline

- 2024-02-12T14:01:30Z @tobiu added the `bug` label
- 2024-02-12T14:01:52Z @tobiu assigned to @tobiu
### @tobiu - 2024-02-12T16:25:33Z

I think it is related to the change from `hintRecordId` to `activeRecordId`, which have a different purpose.

hint => the not selected record which matches via autoComplete

we now also have `activeRecord` and `record`, which have the same purpose.

- 2024-02-20T08:53:06Z @tobiu referenced in commit `0de7537` - "#5214 form.field.Select: onFocusLeave() debugging, cleanup"
- 2024-02-20T11:00:02Z @tobiu referenced in commit `51079e8` - "#5214 form.field.Select: onFocusLeave()"
- 2024-03-14T15:07:35Z @tobiu referenced in commit `7543632` - "form.field.Select: onFocusLeave() no longer clearing values with forceSelection #5214 (in progress)"
- 2024-03-15T08:00:01Z @tobiu referenced in commit `0c87365` - "form.field.Select: onFocusLeave() no longer clearing values with forceSelection #5214 (in progress)"
- 2024-03-26T16:29:34Z @tobiu referenced in commit `6494b7a` - "#5214 form.field.Select: onFocusLeave() debugging, cleanup"
- 2024-03-26T16:29:34Z @tobiu referenced in commit `422fe94` - "#5214 form.field.Select: onFocusLeave()"
- 2024-03-26T16:29:46Z @tobiu referenced in commit `d5204ba` - "form.field.Select: onFocusLeave() no longer clearing values with forceSelection #5214 (in progress)"
- 2024-03-26T16:29:47Z @tobiu referenced in commit `dbd7246` - "form.field.Select: onFocusLeave() no longer clearing values with forceSelection #5214 (in progress)"
### @github-actions - 2024-08-29T02:25:48Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:48Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:30Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:30Z @github-actions closed this issue

