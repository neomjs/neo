---
id: 3196
title: 'data.RecordFactory: createRecord() => smarter matching to model instances'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-06-25T12:12:53Z'
updatedAt: '2022-06-25T12:14:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3196'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-25T12:14:14Z'
---
# data.RecordFactory: createRecord() => smarter matching to model instances

the current logic:
```
createRecord(model, config) {
    let recordClass = Neo.ns(this.recordNamespace + model.className);

    if (!recordClass) {
        recordClass = this.createRecordClass(model);
    }

    return new recordClass(config);
}
```

has a problem: each `data.Store` will create one instance of `data.Model`, which contains the `storeId`. In case multiple stores are using the same model class, the `recordClass` will just use the first created model instance. This can affect listeners, pointing to the wrong stores.

to solve this, we need to add the model.id into the record class namespace.

## Timeline

- 2022-06-25T12:12:53Z @tobiu added the `bug` label
- 2022-06-25T12:12:54Z @tobiu assigned to @tobiu
- 2022-06-25T12:13:34Z @tobiu referenced in commit `ca7581a` - "data.RecordFactory: createRecord() => smarter matching to model instances #3196"
- 2022-06-25T12:14:14Z @tobiu closed this issue

