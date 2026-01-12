---
id: 8047
title: '[Container] Add silent parameter to add() method'
state: CLOSED
labels:
  - enhancement
  - good first issue
  - ai
assignees:
  - tobiu
createdAt: '2025-12-07T12:52:45Z'
updatedAt: '2025-12-07T12:54:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8047'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-07T12:54:59Z'
---
# [Container] Add silent parameter to add() method

The `Neo.container.Base.add(item)` method currently does not support a `silent` parameter, unlike `insert(index, item, silent)` and `remove(component, destroy, silent)`.

This limitation forces a VDOM update cycle every time `add()` is called, which is inefficient when adding multiple items sequentially or when managing complex state transitions (like in drag-and-drop operations) where we might want to defer the update.

**Task:**
Update `Neo.container.Base.prototype.add` to accept a `silent` parameter and pass it through to `insert`.

```javascript
    /**
     * Inserts an item or array of items at the last index
     * @param {Object|Array} item
     * @param {Boolean} [silent=false]
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    add(item, silent=false) {
        let me = this;
        return me.insert(me.items ? me.items.length : 0, item, silent)
    }
```

## Timeline

- 2025-12-07T12:52:47Z @tobiu added the `enhancement` label
- 2025-12-07T12:52:47Z @tobiu added the `good first issue` label
- 2025-12-07T12:52:47Z @tobiu added the `ai` label
- 2025-12-07T12:53:13Z @tobiu assigned to @tobiu
- 2025-12-07T12:54:40Z @tobiu referenced in commit `ea56f18` - "[Container] Add silent parameter to add() method #8047"
- 2025-12-07T12:54:59Z @tobiu closed this issue

