---
id: 8626
title: Container.insert() should be a no-op for same-index moves
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-14T00:15:53Z'
updatedAt: '2026-01-14T00:27:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8626'
author: tobiu
commentsCount: 1
parentIssue: 8601
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T00:27:47Z'
---
# Container.insert() should be a no-op for same-index moves

Currently, `Neo.container.Base.insert(index, item)` does not check if the `item` is already at the specified `index` within the same container. It proceeds to remove and re-insert the item, which triggers unnecessary VDOM updates and potentially destabilizes complex components (like Fragments) or focus state.

**Goal:**
Modify `Neo.container.Base.insert()` to detect this condition and return early (no-op) if the item is already at the target index.

**Logic:**
```javascript
if (item.parent === this && this.items.indexOf(item) === index) {
    return item;
}
```

**Impact:**
- Prevents redundant DOM updates.
- Improves stability for repeated actions (like clicking "Move" buttons multiple times).
- Reduces VDOM diffing overhead.


## Timeline

- 2026-01-14T00:15:55Z @tobiu added the `bug` label
- 2026-01-14T00:15:55Z @tobiu added the `ai` label
- 2026-01-14T00:15:55Z @tobiu added the `core` label
- 2026-01-14T00:16:02Z @tobiu added parent issue #8601
- 2026-01-14T00:25:51Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T00:27:22Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the no-op check in `Neo.container.Base.insert()` to prevent unnecessary VDOM updates when inserting an item into its current position. I also refactored the method to reduce redundant calls to `Neo.typeOf` and `item.parent`.
> 
> The changes were committed in `6ad5eaf3b` (mistakenly referenced as #8627 in the commit message).
> 
> Changes committed and pushed.

- 2026-01-14T00:27:47Z @tobiu closed this issue
- 2026-01-14T00:51:25Z @tobiu cross-referenced by #8616
- 2026-01-14T00:59:10Z @tobiu cross-referenced by #8625

