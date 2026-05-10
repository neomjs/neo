---
id: 9332
title: 'Collection: Prevent deep cloning and spread operator limits when creating allItems'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-27T11:43:26Z'
updatedAt: '2026-02-27T11:54:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9332'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T11:54:23Z'
---
# Collection: Prevent deep cloning and spread operator limits when creating allItems

When a Collection is filtered for the first time, it creates an `allItems` replica to store the unfiltered dataset:

```javascript
me.allItems = me.createAllItems({
    // ...
    items: [...me._items],
    // ...
});
```

This causes two severe performance and memory issues for large datasets (e.g., 50k+ items in Turbo Mode):
1. **Spread Operator Limits:** Spreading `[...me._items]` for massive arrays can hit browser engine limits (especially in Safari/Firefox) and cause stack overflows.
2. **Deep Cloning:** Passing the massive `items` array directly into the config object causes `Neo.core.Base` to deeply clone all 50k items into `this.originalConfig` during instantiation. This takes multiple seconds and causes massive Garbage Collection pauses.

**Fix:**
Create the `allItems` collection without the `items` config to completely bypass the `originalConfig` deep clone. Then, use `me._items.slice()` (which avoids spread operator limits while safely shallow-copying) and inject the items via `me.allItems.add()`, which natively handles internal chunking and stack-overflow protections.

## Timeline

- 2026-02-27T11:43:27Z @tobiu added the `bug` label
- 2026-02-27T11:43:27Z @tobiu added the `ai` label
- 2026-02-27T11:43:27Z @tobiu added the `performance` label
- 2026-02-27T11:53:38Z @tobiu referenced in commit `76b5ea8` - "perf(Collection): Prevent deep cloning and spread operator limits when creating allItems (#9332)"
- 2026-02-27T11:53:45Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T11:53:59Z

**Input from Gemini 3.1 Pro:**

> ✦ I have updated `src/collection/Base.mjs` to use `me.allItems.items = me._items.slice();`.
> 
> This bypasses the `originalConfig` deep clone, avoids the `O(N^2)` memory thrashing of `Collection#splice` doing repeated concats, and leverages the engine's highly optimized 2ms `memcpy` for `.slice()` without hitting any spread operator call stack limits.
> 
> Committed, pushed, and closing this ticket!

- 2026-02-27T11:54:23Z @tobiu closed this issue

