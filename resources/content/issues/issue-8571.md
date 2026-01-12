---
id: 8571
title: 'Feature: Native Declarative Config Injection (mergeFrom) in Container Items'
state: CLOSED
labels:
  - enhancement
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-12T01:56:31Z'
updatedAt: '2026-01-12T02:01:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8571'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-12T02:01:16Z'
---
# Feature: Native Declarative Config Injection (mergeFrom) in Container Items

We have identified a powerful pattern for **declarative configuration injection** in Containers, dubbed the "Structural Injection Pattern". Currently, this is achieved manually in subclasses via `afterSetContentItems`.

We want to support this natively in `Neo.container.Base` by introducing a `mergeFrom` property (likely a Symbol) on item configurations.

**Proposed Logic:**
When `Container` processes its items (in `createItem`), if it encounters an item with `[mergeFrom]: 'configName'`, it should:
1.  Look up the `configName` on the container instance (e.g., `this.headerConfig`).
2.  Deeply merge the item's properties *on top of* the referenced config object.
3.  Use the merged result to create the item.

**Benefits:**
- Eliminates manual `Neo.assignDefaults` in `afterSet...` hooks.
- Decouples structural definition (items) from configuration data.
- Enables cleaner subclassing where configuration can be injected declaratively.

**Proof of Concept:**
A working prototype has been verified in `test/playwright/unit/core/ConfigMerging.spec.mjs`.

**Tasks:**
1.  Define the `mergeFrom` Symbol in `src/core/ConfigSymbols.mjs`.
2.  Implement the interception logic in `src/container/Base.mjs` (likely inside `createItem`).
3.  Ensure it handles both Object-based and Array-based item definitions if applicable (though `createItem` handles individual items).
4.  Verify with existing tests.

## Timeline

- 2026-01-12T01:56:32Z @tobiu added the `enhancement` label
- 2026-01-12T01:56:33Z @tobiu added the `architecture` label
- 2026-01-12T01:56:33Z @tobiu added the `core` label
- 2026-01-12T02:00:43Z @tobiu referenced in commit `0b56c73` - "feat: Implement native declarative config injection (mergeFrom) for Container items (#8571)"
### @tobiu - 2026-01-12T02:00:55Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the native `mergeFrom` feature in `Neo.container.Base`.
> 
> **Changes:**
> 1.  **Symbol Definition:** Added `mergeFrom` symbol to `src/core/ConfigSymbols.mjs`.
> 2.  **Core Logic:** Updated `createItem` in `src/container/Base.mjs` to intercept items with the `mergeFrom` symbol. It retrieves the referenced config from the instance, deeply merges the item properties on top of it, and cleans up the symbol.
> 3.  **Verification:** Added and verified `test/playwright/unit/core/ConfigMerging.spec.mjs`.
> 
> This enables the **Structural Injection Pattern** natively without manual `afterSet...` logic in subclasses.
> 
> Closing as completed.

- 2026-01-12T02:01:03Z @tobiu assigned to @tobiu
- 2026-01-12T02:01:16Z @tobiu closed this issue

