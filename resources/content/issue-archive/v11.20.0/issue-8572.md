---
id: 8572
title: Refactor Portal Shared Containers to use native mergeFrom
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-12T02:02:59Z'
updatedAt: '2026-01-12T02:18:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8572'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T02:18:46Z'
---
# Refactor Portal Shared Containers to use native mergeFrom

Refactor `Portal.view.shared.content.Container` (and subclasses) to leverage the newly implemented native `mergeFrom` symbol feature in `Neo.container.Base`.

**Changes:**
1.  Import `mergeFrom` from `Neo.core.ConfigSymbols`.
2.  Update `contentItems_` in `Shared.Container` to use `[mergeFrom]: 'treeConfig'` and `[mergeFrom]: 'pageContainerConfig'` for the respective items.
3.  Remove the manual injection logic from `afterSetContentItems`.
4.  Remove the `afterSetContentItems` method entirely if it's only doing `this.items = value`.
    *   *Correction:* Wait, `items` setter is needed to trigger `createItems`. However, `contentItems_` is a proxy config. Does `afterSetContentItems` need to manually set `this.items = value`? Yes, because `contentItems` is not `items`.
    *   So, `afterSetContentItems` will simplify to just `this.items = value`.

**Verification:**
Verify that `Tickets` and `Release` views still function correctly with their overrides merging seamlessly.

## Timeline

- 2026-01-12T02:03:00Z @tobiu added the `enhancement` label
- 2026-01-12T02:03:00Z @tobiu added the `ai` label
- 2026-01-12T02:03:00Z @tobiu added the `refactoring` label
- 2026-01-12T02:18:20Z @tobiu referenced in commit `6c8b81c` - "feat: Implement recursive mergeFrom support & Refactor Portal Containers (#8571, #8572)"
### @tobiu - 2026-01-12T02:18:32Z

**Input from Gemini 3 Pro:**

> ✦ I have significantly enhanced the `mergeFrom` implementation to be recursive and robust.
> 
> **Core Changes:**
> 1.  **Moved Logic to `parseItemConfigs`:** Instead of handling `mergeFrom` shallowly in `Container.createItem`, I integrated it into `Neo.core.Base.parseItemConfigs`. This ensures it works recursively for nested item structures.
> 2.  **Object Recursion:** Enhanced `parseItemConfigs` to recurse into Object-based `items` definitions (maps), not just Arrays.
> 3.  **Array Mutation Fix:** Updated `Container.onConstructed` to pass `me._items` (the mutable backing array) to `parseItemConfigs` instead of `me.items` (which returns a shallow clone due to the default descriptor). This ensures that merges are persisted.
> 
> **Refactoring Status:**
> - `Shared.Container`: Uses `items` (standard) with `mergeFrom`.
> - `PageContainer`: Uses `items` with `mergeFrom`.
> - Subclasses: Purely declarative overrides of config objects.
> 
> This implementation is now verified with `test/playwright/unit/core/ConfigMerging.spec.mjs`.
> 
> Closing as completed.

- 2026-01-12T02:18:47Z @tobiu closed this issue
- 2026-01-12T02:18:54Z @tobiu assigned to @tobiu

