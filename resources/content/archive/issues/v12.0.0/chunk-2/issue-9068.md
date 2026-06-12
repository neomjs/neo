---
id: 9068
title: 'Refactor: Global Audit & Fix for ''keyProperty'' Access (Turbo Mode Compatibility)'
state: CLOSED
labels:
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T02:44:45Z'
updatedAt: '2026-02-10T01:10:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9068'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T01:10:37Z'
---
# Refactor: Global Audit & Fix for 'keyProperty' Access (Turbo Mode Compatibility)

**Context:**
The introduction of "Turbo Mode" (`autoInitRecords: false`) combined with Model Field Mapping has exposed a critical architectural vulnerability.
-   **Turbo Mode:** The Store holds Raw Objects (POJOs) to save memory.
-   **Mapping:** The Raw Object keys (e.g. `'l'`) differ from the Model's canonical field names (e.g. `'login'`).
-   **KeyProperty:** Stores are now configured with the canonical name (`keyProperty: 'login'`) to align with Records.

**The Problem:**
Many components (Grid, List, SelectionModel) and the Store itself access data using `item[keyProperty]`.
-   **On Raw Object:** `item['login']` is `undefined`. (It has `'l'`).
-   **On Record:** `record['l']` is `undefined`. (It has `'login'`).

**The Solution:**
We implemented `Neo.data.Store#getKey(item)` which handles this resolution transparently (checking direct access, then mapping, then getters).

**Task:**
Perform a codebase-wide audit (`src`, `apps`, `examples`) to identify and refactor all locations where `keyProperty` or `getKeyProperty()` is used to access object properties directly.
Replace them with `store.getKey(item)`.

**Critical Areas:**
-   `src/data/Store.mjs` (Internal methods: `find`, `insert`, etc.)
-   `src/list/Base.mjs` (Item ID generation)
-   `src/grid/` (Any remaining spots)
-   `examples/` (To ensure demos don't break)

**Goal:** Ensure the framework is robust against Mixed Mode (Raw/Record) data storage.

## Timeline

- 2026-02-09T02:44:46Z @tobiu assigned to @tobiu
- 2026-02-09T02:44:46Z @tobiu added the `core` label
- 2026-02-09T10:01:41Z @tobiu referenced in commit `9556e57` - "refactor: Global Audit & Fix for 'keyProperty' Access (Turbo Mode Compatibility) (#9068)"
### @tobiu - 2026-02-09T10:02:47Z

**Input from Gemini 3 Pro:**

> ✦ **Task Completed: Global Audit & Fix for 'keyProperty' Access (Turbo Mode Compatibility)**
> 
> **Objective:**
> Ensure framework robustness against Mixed Mode (Raw/Record) data storage, specifically addressing the "Turbo Mode" (`autoInitRecords: false`) scenario where raw object keys (e.g., `'l'`) differ from Model field names (e.g., `'login'`).
> 
> **Key Implementations:**
> 
> 1.  **Polymorphic Key Resolution (`getKey()`):**
>     -   Refactored `src/data/Store.mjs` and `src/collection/Base.mjs` to replace direct `keyProperty` access with `me.getKey(item)`.
>     -   This method intelligently resolves keys from either Records (via getters) or Raw Objects (via direct access or mapping lookup).
>     -   **Critical Internal Methods Updated:** `add`, `find`, `findBy`, `insert`, `initRecord`, `afterSetItems`, and `filter`.
> 
> 2.  **Robust ID Parsing (`getKeyType()`):**
>     -   Updated `src/list/Base.mjs` to use `store.getKeyType()?.includes('int')` for strictly determining when to parse DOM IDs back into integers.
>     -   This replaces brittle manual checks and prevents issues with string-based IDs in non-Model Stores.
>     -   **Propagated to:** `src/component/Gallery.mjs`, `src/component/Helix.mjs`, `src/list/Component.mjs`.
> 
> **Scope of Refactoring:**
> -   **Files Changed:** 18 files across `src`, `apps`, and `examples`.
> -   **Components Updated:**
>     -   `Neo.list.Base`, `Neo.list.Component`
>     -   `Neo.menu.List`
>     -   `Neo.component.Gallery`, `Neo.component.Helix`
>     -   `Neo.tree.Accordion`
>     -   Calendar views (`ColorsList`, `CalendarsList`)
> -   **Apps/Examples Verified:** `apps/realworld2`, `apps/covid`, `apps/sharedcovid`, `examples/component/corona*`.
> 
> **Outcome:**
> The framework can now safely handle mixed data types in Stores, preserving the performance benefits of Turbo Mode while maintaining correct item identification and selection logic across all major data-bound components.

- 2026-02-10T01:10:38Z @tobiu closed this issue

