---
id: 8099
title: Fix initialIndexSymbol assignment in Neo.collection.Base
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-12T21:39:06Z'
updatedAt: '2025-12-12T21:42:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8099'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T21:42:25Z'
---
# Fix initialIndexSymbol assignment in Neo.collection.Base

### Problem
The `splice` method in `Neo.collection.Base` was unconditionally assigning the `initialIndexSymbol` to all added items if they didn't already have it.

```javascript
// Previous Logic
if (!Object.hasOwn(item, initialIndexSymbol)) {
    item[initialIndexSymbol] = me.initialIndexCounter++
}
```

This caused plain objects in generic collections to be polluted with this symbol, leading to unit test failures in `Neo.collection.Base`.

### Solution
Invert the logic to only assign the index counter if the item *already* possesses the symbol key (which `Neo.data.Record` instances do, initialized to `null`).

```javascript
// New Logic
if (Object.hasOwn(item, initialIndexSymbol)) {
    item[initialIndexSymbol] = me.initialIndexCounter++
}
```

This ensures the feature is "opt-in" and works correctly for `Neo.data.Store` (where records have the symbol) while ignoring plain objects in standard collections.

## Timeline

- 2025-12-12T21:39:06Z @tobiu added the `bug` label
- 2025-12-12T21:39:07Z @tobiu added the `ai` label
- 2025-12-12T21:41:57Z @tobiu assigned to @tobiu
- 2025-12-12T21:42:14Z @tobiu referenced in commit `a48c9db` - "Fix initialIndexSymbol assignment in Neo.collection.Base #8099"
- 2025-12-12T21:42:26Z @tobiu closed this issue

