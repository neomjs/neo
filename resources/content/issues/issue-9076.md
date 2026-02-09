---
id: 9076
title: 'perf: Implement O(1) Lookup Map for internalId'
state: OPEN
labels:
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T13:46:24Z'
updatedAt: '2026-02-09T14:20:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9076'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# perf: Implement O(1) Lookup Map for internalId

**Context:**
The recent adoption of `internalId` (#9070) introduced robust identity for Records and Raw Objects. However, resolving an item from its `internalId` currently relies on `store.items.find(...)`, which is an **O(N)** operation.
In large datasets (e.g. 100k rows), this kills performance for selection, navigation, and drag-and-drop operations that rely on reverse lookup.

**Objective:**
Implement a secondary map (`internalIdMap`) in `Neo.collection.Base` to provide **O(1)** lookup for `internalId` (or any secondary key).

**Architecture:**
1.  **Collection.Base:**
    *   Add `trackInternalId` config (or similar flag).
    *   Add `internalIdMap` (Map).
    *   Add `getInternalKey(item)` method (to be overridden).
    *   Update `splice` (add/remove logic) to maintain `internalIdMap` in sync with the primary map.
    *   Add `getByInternalId(id)` accessor.

2.  **Store:**
    *   Enable tracking.
    *   Override `getInternalKey` to return `item[internalId]`.

3.  **Refactor Consumers:**
    *   Update `GridBody`, `TableBody`, `Helix`, `Gallery`, `SelectionModels` to use `store.getByInternalId(id)` instead of `store.items.find(...)`.

**Result:**
Restores O(1) performance for all ID-based lookups in the framework.


## Timeline

- 2026-02-09T13:46:25Z @tobiu added the `ai` label
- 2026-02-09T13:46:25Z @tobiu added the `performance` label
- 2026-02-09T13:46:25Z @tobiu added the `core` label
- 2026-02-09T13:46:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-09T14:20:14Z

**Input from Gemini 3 Pro:**

> ✦ **Architecture & Implementation Plan (Handoff)**
> 
> **Objective:**
> Restore O(1) performance for `internalId` lookups. Currently, the framework relies on `store.items.find(...)` in critical paths (selection, navigation), which is O(N) and creates performance bottlenecks for large datasets.
> 
> **Architectural Decision:**
> We will implement **Option A: Direct Reference Map**.
> `internalIdMap` will map `internalId -> Item Reference` (either a Record instance or a Raw Data Object).
> 
> **Implementation Plan:**
> 
> 1.  **Enhance `Neo.collection.Base`:**
>     *   Add `trackInternalId: false` (config).
>     *   Add `internalIdMap: null` (property, initialized if tracking is enabled).
>     *   Add `getInternalKey(item)` method (hook, default returns null).
>     *   Update `splice` and `afterSetItems` logic to:
>         *   Get the internal key via `getInternalKey(item)`.
>         *   If valid, add to `internalIdMap`.
>         *   On remove, delete from `internalIdMap`.
>     *   Add `getByInternalId(id)` accessor method.
> 
> 2.  **Update `Neo.data.Store`:**
>     *   Set `trackInternalId: true` by default.
>     *   Override `getInternalKey(item)` to return `item[internalId]` (using the symbol).
>     *   **Turbo Mode Sync:** In `get(key)` and `getAt(index)`, when a Raw Object is hydrated into a Record:
>         *   Explicitly update `internalIdMap` to point to the new Record instance instead of the old Raw Object.
>         *   This ensures `getByInternalId` returns the correct reference used by the View.
> 
> 3.  **Refactor Consumers (Cleanup Phase):**
>     *   Update `Helix`, `Gallery`, `ComboBox`, `GridBody`, `TableBody`, and `SelectionModels`.
>     *   Replace all instances of `store.items.find(r => ... === id)` with `store.getByInternalId(id)`.
>     *   This will dramatically simplify the record resolution logic and restore performance.
> 
> **Note:**
> The `internalId` symbol is exported from `src/core/ConfigSymbols.mjs`. Use it to access the property safely.


