---
id: 8095
title: Optimize Store.initRecord to avoid redundant get() calls
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-12T12:23:48Z'
updatedAt: '2025-12-12T12:38:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8095'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T12:38:05Z'
---
# Optimize Store.initRecord to avoid redundant get() calls

The `add()` and `insert()` methods in `Neo.data.Store` now default to returning record instances (`init=true`). This means `initRecord()` is called more frequently with items that might already be record instances.

Currently, `initRecord()` calls `this.get()`, which internally checks if the item is a record. To avoid this unnecessary method call and lookup, we should add an explicit check in `initRecord()`:

```javascript
initRecord(data) {
    if (RecordFactory.isRecord(data)) {
        return data;
    }
    return this.get(data[this.getKeyProperty()])
}
```

This optimizes the common path where records are already present.

## Timeline

- 2025-12-12T12:23:49Z @tobiu added the `enhancement` label
- 2025-12-12T12:23:49Z @tobiu added the `ai` label
- 2025-12-12T12:24:19Z @tobiu assigned to @tobiu
- 2025-12-12T12:37:59Z @tobiu referenced in commit `07f24dc` - "Optimize Store.initRecord to avoid redundant get() calls #8095"
- 2025-12-12T12:38:05Z @tobiu closed this issue

