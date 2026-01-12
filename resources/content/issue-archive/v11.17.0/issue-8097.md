---
id: 8097
title: Introduce autoInitRecords config for Neo.data.Store
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-12-12T12:57:30Z'
updatedAt: '2025-12-12T13:08:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8097'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T13:05:52Z'
---
# Introduce autoInitRecords config for Neo.data.Store

To improve Developer Experience (DX) and allow easier control over the "Turbo Mode" (lazy record instantiation) strategy in `Neo.data.Store`, we will introduce a new config: `autoInitRecords`.

This config will serve as the default value for the `init` parameter in `add()` and `insert()` methods, and will also control how the `data` config is processed.

**Proposed Changes:**
1.  Add `autoInitRecords: true` to `Neo.data.Store` config.
2.  Update `add(item, init=this.autoInitRecords)`
3.  Update `insert(index, item, init=this.autoInitRecords)`
4.  Update `afterSetData` to use `me.add(value, me.autoInitRecords)` instead of hardcoded `false`.
5.  Update JSDoc and tests.

This allows developers to simply set `autoInitRecords: false` on the Store to enable Turbo Mode globally for that store instance, without needing to pass flags to every method call.

## Timeline

- 2025-12-12T12:57:31Z @tobiu added the `enhancement` label
- 2025-12-12T12:57:31Z @tobiu added the `developer-experience` label
- 2025-12-12T12:57:31Z @tobiu added the `ai` label
- 2025-12-12T12:57:48Z @tobiu assigned to @tobiu
- 2025-12-12T13:05:46Z @tobiu referenced in commit `8fe4e63` - "Introduce autoInitRecords config for Neo.data.Store #8097"
- 2025-12-12T13:05:52Z @tobiu closed this issue
### @tobiu - 2025-12-12T13:08:17Z

**Input from Gemini:**

> ✦ The current state of `Neo.data.Store` is significantly improved for both performance and Developer Experience (DX), even without the larger refactoring.
> 
> **Improvements:**
> 1.  **Optimization**: The `initRecord` check prevents redundant `get()` calls and lookups when dealing with already-instantiated records. This is a solid micro-optimization that will add up in high-frequency operations.
> 2.  **Flexibility & DX**: The introduction of `autoInitRecords` transforms "Turbo Mode" from an obscure parameter into a first-class, declarative configuration. This makes it much easier to configure stores for bulk-data scenarios (like big grids) without polluting every `add()` call in the application logic.
> 3.  **Reliability**: We now have a dedicated unit test suite for `Store`. This is a crucial baseline. Before, testing relied on `Collection` tests or side-effects in component tests. Having a dedicated suite allows us to confidently refactor or add features (like the future Collection composition refactor) with a safety net.
> 
> **Future Considerations (Out of Scope for now):**
> *   **Collection Composition**: Moving from `extends Collection` to *using* a Collection (composition over inheritance) is the big architectural shift needed. This will likely simplify the API surface of Store and separate "storage" concerns from "model/proxy" concerns.
> *   **`afterSetData` Logic**: The behavior where setting `data` appends instead of replacing (if `oldValue` is null) is a bit quirky. A future cleanup might want to standardize `data` as "replace content" vs `add` as "append".
> *   **Type Safety**: The return types of `add`/`insert` are dynamic (`number` vs `Record[]`). While documented, this polymorphism can be a source of bugs. The new config makes it more predictable per-instance, but the method signature is still polymorphic.
> 
> Overall, the Store is in a much better place for immediate usage, especially for high-performance use cases.


