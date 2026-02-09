---
id: 9068
title: 'Refactor: Global Audit & Fix for ''keyProperty'' Access (Turbo Mode Compatibility)'
state: OPEN
labels:
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T02:44:45Z'
updatedAt: '2026-02-09T02:44:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9068'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

