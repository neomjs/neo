---
id: 8100
title: Fix Store.add regression causing isLoaded to remain false
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2025-12-12T22:51:05Z'
updatedAt: '2025-12-12T22:58:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8100'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T22:58:55Z'
---
# Fix Store.add regression causing isLoaded to remain false

### Problem
A recent change to `Neo.data.Store` (specifically the optimization to return early when `init=true` in `add()`) introduced a regression where `me.isLoaded` was not being set to `true` in the eager instantiation path.

**Broken Code:**
```javascript
if (init) {
    super.add(items);
    return items.map(i => me.get(i[me.getKeyProperty()])) // isLoaded never set!
}
```

This caused components relying on `isLoaded` (like `ComboBox` during initial value resolution) to fail, as they perceived the store as unloaded even after data was added.

### Solution
Ensure `me.isLoaded = true` is set in the eager instantiation path as well.

```javascript
if (init) {
    super.add(items);
    me.isLoaded = true; // Fix
    return items.map(i => me.get(i[me.getKeyProperty()]))
}
```

## Timeline

- 2025-12-12T22:51:06Z @tobiu added the `bug` label
- 2025-12-12T22:51:07Z @tobiu added the `ai` label
- 2025-12-12T22:51:07Z @tobiu added the `regression` label
- 2025-12-12T22:51:19Z @tobiu assigned to @tobiu
- 2025-12-12T22:56:33Z @tobiu referenced in commit `13ae93e` - "Fix Store.add regression causing isLoaded to remain false #8100"
- 2025-12-12T22:58:55Z @tobiu closed this issue

