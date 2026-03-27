---
id: 9414
title: Refactor `Neo.data.Store` to unify Record Hydration
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T14:13:03Z'
updatedAt: '2026-03-09T14:18:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9414'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T14:18:04Z'
---
# Refactor `Neo.data.Store` to unify Record Hydration

### Goal
Extract the duplicate lazy-instantiation ("hydration") logic currently found in `Store.get()` and `Store.getAt()` into a single, overridable protected method: `hydrateRecord(item, index)`.

### Context
In "Turbo Mode" (`autoInitRecords: false`), records are stored as raw JSON objects and are only instantiated into `Neo.data.Record` instances when accessed via `get()` or `getAt()`. Currently, both methods duplicate the logic for converting the object, updating `me.map`, `me._items`, `me.internalIdMap`, and the `allItems` collection.

By centralizing this logic into `hydrateRecord(item, index)`, we establish a "Single Source of Truth" for the instantiation event. This is strictly required for subclasses like `TreeStore` that need to maintain their own secondary maps (`#childrenMap`) and must be notified exactly when a raw object's identity changes into a Record instance.

### Acceptance Criteria
- Create `hydrateRecord(item, index)` in `src/data/Store.mjs`.
- Refactor `get()` and `getAt()` to simply call `return this.hydrateRecord(super.get(key))` (or similar).
- Ensure existing Store tests continue to pass.

## Timeline

- 2026-03-09T14:13:05Z @tobiu added the `enhancement` label
- 2026-03-09T14:13:05Z @tobiu added the `ai` label
- 2026-03-09T14:13:05Z @tobiu added the `refactoring` label
- 2026-03-09T14:13:06Z @tobiu added the `core` label
- 2026-03-09T14:13:27Z @tobiu added parent issue #9404
- 2026-03-09T14:13:51Z @tobiu cross-referenced by #9415
- 2026-03-09T14:17:04Z @tobiu referenced in commit `3a143d5` - "refactor: Centralize Record hydration in Store (#9414)

- Extracted duplicated lazy-instantiation logic from get() and getAt() into a new protected method hydrateRecord(item, index).
- This provides a Single Source of Truth for Turbo Mode hydration, enabling subclasses (like TreeStore) to safely intercept and synchronize their own internal maps."
### @tobiu - 2026-03-09T14:17:23Z

**Input from Gemini 3.1 Pro:**

> ✦ Refactored `Store.mjs` to centralize lazy instantiation into `hydrateRecord(item, index)`.
> `get()` and `getAt()` now delegate to this method.
> 
> Pushed to `dev`.

- 2026-03-09T14:17:46Z @tobiu assigned to @tobiu
- 2026-03-09T14:18:05Z @tobiu closed this issue

