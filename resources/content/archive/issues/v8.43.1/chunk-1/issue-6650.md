---
id: 6650
title: neo/examples/stateProvider/Table.mjs invokes onStoreLoad  _twice_ ??
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-04-15T08:09:08Z'
updatedAt: '2025-04-15T16:38:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6650'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-15T08:51:31Z'
---
# neo/examples/stateProvider/Table.mjs invokes onStoreLoad  _twice_ ??

Running neo/examples/stateProvider/Table.mjs invokes onStoreLoad  _twice_, hence createViewData is invoked twice.  Shouldn't this only load once?


https://github.com/neomjs/neo/blob/42029c4405b6a5c1189fb5ad641672db584eccc1c/src/table/Container.mjs#L476

```
    onStoreLoad(data) {
        let me = this;

        if (me.rendered) {
            me.createViewData();
```

https://github.com/neomjs/neo/blob/42029c4405b6a5c1189fb5ad641672db584eccc1/src/table/View.mjs#L325

```
    createViewData() {
        let me                    = this,
            {selectedRows, store} = me,
            countRecords          = store.getCount(),
            i                     = 0,
            rows                  = [];

        for (; i < countRecords; i++) {     /////////   this 
            rows.push(me.createRow({record: store.items[i], rowIndex: i}))
        }
```





## Timeline

- 2025-04-15T08:09:08Z @gplanansky added the `bug` label
- 2025-04-15T08:48:02Z @tobiu assigned to @tobiu
- 2025-04-15T08:48:16Z @tobiu referenced in commit `b115bde` - "neo/examples/stateProvider/Table.mjs invokes onStoreLoad _twice_ ?? #6650"
### @tobiu - 2025-04-15T08:51:30Z

Hi @gplanansky,

Obviously it should not happen, although the vdom engine will catch it => no duplicate DOM manipulations.

I changed the store internally a bit:
https://github.com/neomjs/neo/blob/dev/src/data/Store.mjs#L435

* `onConstructed()` now triggers a slightly delayed load event, in case there is data.
* so, `beforeSetStore()` inside the table container no longer needs to to this as well.
* double-checked the grid, and it was already adjusted there.

- 2025-04-15T08:51:31Z @tobiu closed this issue
- 2025-04-15T08:52:21Z @tobiu referenced in commit `01b7f68` - "#6650 removed testing log"
### @gplanansky - 2025-04-15T16:38:52Z

Thanks.  Debugging a data app's event-triggered reload logic, which I use a lot,  gets confounded if core store / table  have their own bug.  I could see the trace going through beforeSetStore, but didn't sort it out.


