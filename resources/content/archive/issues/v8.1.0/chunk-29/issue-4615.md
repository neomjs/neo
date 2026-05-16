---
id: 4615
title: 'form.field.Select: recordId_ config'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-02T11:36:30Z'
updatedAt: '2023-08-07T12:56:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4615'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-07T12:56:19Z'
---
# form.field.Select: recordId_ config

The SelectField extends TextField and the `value` config is a plain representation of the fields input value. This part makes sense, since a SelectField can have `editable: true` & `forceSelection: false`.

However, we want to programmatically select items. For this, we also have a `record` config. If set, the field will adjust its value to the displayField of the record and select the item inside the connected `list.Base`.

This works fine, but can be complicated to use if you just want to drop in configs into a `form.Container` while assigning a default selected item.

So, a `recordId_` config can help: it should use `afterSetRecordId(value, oldValue)` to check if there is a matching record inside the store. If so, set the record config to it and done.

If there is no match for a record and `editable: true` & `forceSelection: false`, we can assign the recordId to the value instead.

`afterSetRecord()` should silently update the recordId => `this._recordId = value[this.valueField]`.

Afterwards, inside `form.Container`, the getters & setters should get adjusted to prefer returning / setting the recordId. With the fallback to change the value for non-matches, we should cover all use cases.

## Timeline

- 2023-08-02T11:36:30Z @tobiu added the `enhancement` label
### @tobiu - 2023-08-07T12:56:19Z

@ExtAnimal did look into this one, and noticed that there is nothing to do, since we already can use `recordIds` as field values. The API of the class could get improved though. Might be a follow up ticket.

```
    beforeSetValue(value, oldValue) {
        let me           = this,
            displayField = me.displayField,
            store        = me.store,
            record;

        if (Neo.isObject(value)) {
            me.record = value;
            return value[displayField];
        } else {
            record = store.isFiltered() ? store.allItems.get(value) : store.get(value);

            if (record) {
                me.record = record;
                return record[displayField];
            }
        }

        me.record = store.find(displayField, value)[0] || null;

        return value
    }
```

- 2023-08-07T12:56:19Z @tobiu closed this issue

