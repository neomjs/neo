---
id: 9067
title: 'Fix: Resolve Mapped KeyProperty Conflict in Turbo Mode via Store.getKey()'
state: CLOSED
labels:
  - bug
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T02:11:55Z'
updatedAt: '2026-02-09T02:44:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9067'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T02:44:17Z'
---
# Fix: Resolve Mapped KeyProperty Conflict in Turbo Mode via Store.getKey()

Resolve `keyProperty` access conflicts when using Mapped Fields in Turbo Mode (`autoInitRecords: false`).

**The Problem:**
1.  **Turbo Mode:** Store holds raw objects. `keyProperty` points to the raw data key (e.g. `'l'`). `rawItem['l']` works.
2.  **Lazy Instantiation:** When accessed, raw objects become Records. `RecordFactory` creates getters for *canonical* field names (e.g. `login`), but NOT for mapped source keys. `record['l']` is `undefined`.
3.  **Selection Model:** Uses `record[store.getKeyProperty()]`. If `keyProperty` is `'l'`, this fails on instantiated records.

**The Fix:**
1.  **`Neo.data.Store#getKey(item)`:** Implement a helper method to resolve the key regardless of item type.
    -   Try `item[keyProp]`.
    -   If undefined & item is Record, try `item.get(keyProp)`.
2.  **Refactor Selection Models:** Update `RowModel` (and others) to use `store.getKey(record)` instead of direct access.

**Goal:** Transparently support mapped key properties in mixed Raw/Record environments.

## Timeline

- 2026-02-09T02:11:55Z @tobiu assigned to @tobiu
- 2026-02-09T02:11:56Z @tobiu added the `bug` label
- 2026-02-09T02:11:56Z @tobiu added the `core` label
### @tobiu - 2026-02-09T02:36:10Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the critical `keyProperty` conflict that was breaking Grid selection in Turbo Mode.
> 
> **The Fix:**
> 1.  **Architecture:** Implemented `Neo.data.Store#getKey(item)`.
>     -   This helper acts as a bridge between Raw Objects (Turbo Mode) and Record Instances.
>     -   It supports **Reverse Mapping Lookup**: If the Store uses a canonical key (e.g. `login`) but the raw item only has the source key (e.g. `l`), it resolves the correct value using the Model definition.
> 2.  **Refactoring:** Updated `Row.mjs` and all `SelectionModel` classes to use `store.getKey(record)` instead of direct property access (`record[key]`), preventing `undefined` lookups on instantiated records.
> 3.  **App Config:** Updated `DevRank.store.Contributors` to use the correct canonical `keyProperty: 'login'` instead of the raw `'l'`, ensuring architectural consistency.
> 
> **Outcome:**
> -   Selection works correctly for both Raw Objects (Turbo) and Instantiated Records.
> -   "All Rows Selected" bug is eliminated (no more `undefined === undefined` matches).

- 2026-02-09T02:37:35Z @tobiu referenced in commit `bab630b` - "Fix: Resolve Mapped Key Conflict via Store.getKey() & Canonical Config (#9067)"
- 2026-02-09T02:37:35Z @tobiu referenced in commit `2060f50` - "Fix: Update Grid Body getLogicalCellId to use Store.getKey (#9067)"
- 2026-02-09T02:44:17Z @tobiu closed this issue
- 2026-02-09T02:55:05Z @tobiu cross-referenced by #9069

