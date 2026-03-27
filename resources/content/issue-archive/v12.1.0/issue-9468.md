---
id: 9468
title: Fix memory leak in TreeStore.#rebuildKeysAndCount()
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-13T15:12:52Z'
updatedAt: '2026-03-13T15:19:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9468'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-13T15:19:08Z'
---
# Fix memory leak in TreeStore.#rebuildKeysAndCount()

### Bug Description
In `TreeStore.#rebuildKeysAndCount()`, an array `_keys` is allocated and assigned to the store instance (`me._keys = new Array(len)`). This array is only used locally within this method to populate the internal `map` and is never read or used anywhere else in the `Collection` or `TreeStore` lifecycle. Because it is bound to the instance, it persists indefinitely, causing an unnecessary memory leak that grows with every bulk projection (like `expandAll` or `filter`).

### Solution
Remove the assignment to `me._keys` and use a local variable instead to prevent the memory leak.

```javascript
    #rebuildKeysAndCount() {
        let me    = this,
            items = me._items,
            len   = items.length,
            keys  = new Array(len),
            {map} = me;

        map.clear();

        for (let i = 0; i < len; i++) {
            let key = me.getKey(items[i]);
            keys[i] = key;
            map.set(key, items[i])
        }

        me.count = len
    }
```

## Timeline

- 2026-03-13T15:12:53Z @tobiu added the `bug` label
- 2026-03-13T15:12:53Z @tobiu added the `ai` label
- 2026-03-13T15:16:56Z @tobiu referenced in commit `b55b422` - "fix(TreeStore): Remove memory leak in #rebuildKeysAndCount (#9468)

- Switched from me._keys assignment to a localized keys array variable"
- 2026-03-13T15:17:20Z @tobiu assigned to @tobiu
- 2026-03-13T15:19:08Z @tobiu closed this issue

