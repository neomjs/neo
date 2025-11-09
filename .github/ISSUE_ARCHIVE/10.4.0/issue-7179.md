---
id: 7179
title: >-
  Refactor `collection.Base#construct` to prevent race conditions during
  instantiation.
state: CLOSED
labels:
  - bug
  - enhancement
assignees:
  - tobiu
createdAt: '2025-08-11T10:16:08Z'
updatedAt: '2025-08-11T10:20:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7179'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-08-11T10:20:03Z'
---
# Refactor `collection.Base#construct` to prevent race conditions during instantiation.

**Reported by:** @tobiu on 2025-08-11

**Is your feature request related to a problem? Please describe.**
Yes. During the instantiation of a `Neo.collection.Base` subclass (or a class that uses it, like `Neo.data.Store`), config setters can be triggered by the `super.construct()` call before the collection's internal properties are fully initialized.

A concrete example is in `examples/grid/bigData/MainStore.mjs`. The `afterSetAmountRows` method can be called during the store's construction. This method calls `me.add()`, which in turn calls the collection's `splice()` method.

The `splice()` method contains the logic `if (me[updatingIndex] === 0)`. Before the `construct` method is refactored, the symbol properties like `updatingIndex` are defined *after* `super.construct()`. This means that when `splice()` is called during instantiation, `me[updatingIndex]` is `undefined`, causing the check to fail and preventing the `mutate` event from firing correctly.

**Describe the solution you'd like**
The `construct` method of `Neo.collection.Base` should be refactored to initialize its internal symbol-based properties *before* calling `super.construct(config)`.

The implementation should be changed from:
```javascript
// Old implementation
construct(config) {
    super.construct(config);

    let me           = this,
        symbolConfig = {enumerable: false, writable: true};

    me.items = me.items || [];

    Object.defineProperties(me, {
        [countMutations]  : {...symbolConfig, value: false},
        [isFiltered]      : {...symbolConfig, value: false},
        [isSorted]        : {...symbolConfig, value: false},
        [silentUpdateMode]: {...symbolConfig, value: false},
        [toAddArray]      : {...symbolConfig, value: []},
        [toRemoveArray]   : {...symbolConfig, value: []},
        [updatingIndex]   : {...symbolConfig, value: 0}
    });

    if (me.autoSort && me._sorters.length > 0) {
        me.doSort()
    }
}
```

To:
```javascript
// New implementation
construct(config) {
    let me           = this,
        symbolConfig = {enumerable: false, writable: true};

    Object.defineProperties(me, {
        [countMutations]  : {...symbolConfig, value: false},
        [isFiltered]      : {...symbolConfig, value: false},
        [isSorted]        : {...symbolConfig, value: false},
        [silentUpdateMode]: {...symbolConfig, value: false},
        [toAddArray]      : {...symbolConfig, value: []},
        [toRemoveArray]   : {...symbolConfig, value: []},
        [updatingIndex]   : {...symbolConfig, value: 0}
    });

    super.construct(config);

    me.items = me.items || [];

    if (me.autoSort && me._sorters.length > 0) {
        me.doSort()
    }
}
```
This ensures that properties like `updatingIndex` have their default value (`0`) set before any config setters are invoked, fixing the race condition.

**Describe alternatives you've considered**
An alternative would be to add checks for `undefined` in all methods that use these symbol properties (e.g., `if (me[updatingIndex] === 0 || me[updatingIndex] === undefined)`). However, this is verbose, less clean, and only patches the symptoms. The proposed solution addresses the root cause of the initialization order problem.

**Additional context**
This change makes the `Collection` class more robust and prevents subtle bugs in components that rely on it, especially when they perform data manipulations within their config setters.

