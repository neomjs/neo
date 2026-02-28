---
id: 8909
title: 'Enhancement: Add reset parameter to Collection.clear() and clearSilent()'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-30T09:50:38Z'
updatedAt: '2026-01-30T10:06:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8909'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-30T10:06:16Z'
---
# Enhancement: Add reset parameter to Collection.clear() and clearSilent()

### Description
Enhance `Neo.collection.Base.clear()` and `clearSilent()` with a new `reset` parameter to control whether the `allItems` (snapshot) collection is also cleared.

### Current Behavior
`clear()` and `clearSilent()` unconditionally clear the `allItems` collection if it exists.

### Proposed Behavior
Add a `reset` parameter (Boolean, default `true`).
- `reset: true` (Default): Clears both the main collection and `allItems`.
- `reset: false`: Clears only the main collection, preserving `allItems`.

### Impact
- `src/collection/Base.mjs`
- `src/data/Store.mjs` (inherits)

### Benefits
Allows for "soft clears" where the current view is emptied but the source of truth (`allItems`) is preserved, enabling scenarios like re-filtering without data loss.

## Timeline

- 2026-01-30T09:50:39Z @tobiu added the `enhancement` label
- 2026-01-30T09:50:39Z @tobiu added the `ai` label
- 2026-01-30T09:50:39Z @tobiu added the `core` label
- 2026-01-30T10:05:52Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-30T10:05:55Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the enhancement by adding a `reset` parameter to `clear()` and `clearSilent()` in `src/collection/Base.mjs`.
> 
> - `reset=true` (Default): Clears both the main items and `allItems`.
> - `reset=false`: Clears only the main items, preserving `allItems` (useful for filtering scenarios).
> 
> I also updated `examples/grid/bigData/MainStore.mjs` to use `me.clear(false)` when regenerating data for `allItems`, which is a cleaner fix than checking for `sourceId`.
> 
> Changes committed in `c125211d9`.

- 2026-01-30T10:05:59Z @tobiu referenced in commit `c125211` - "feat: Add reset param to clear()/clearSilent(), use clear(false) in BigData demo (#8909)"
- 2026-01-30T10:06:16Z @tobiu closed this issue

