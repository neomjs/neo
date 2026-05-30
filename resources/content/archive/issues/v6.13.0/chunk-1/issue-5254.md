---
id: 5254
title: 'form.field.Select: beforeSetValue()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-02-20T11:03:15Z'
updatedAt: '2024-02-20T11:05:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5254'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-20T11:05:07Z'
---
# form.field.Select: beforeSetValue()

`this.record` does get overruled at the end of the method.

this code is weird:
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

this.record should get set to null in case the local record var is undefined.

@ExtAnimal 

## Timeline

- 2024-02-20T11:03:15Z @tobiu added the `bug` label
- 2024-02-20T11:03:16Z @tobiu assigned to @tobiu
### @tobiu - 2024-02-20T11:05:07Z

wait. actually it is ok, since further checks trigger a `return` right away.

- 2024-02-20T11:05:07Z @tobiu closed this issue

