---
id: 9070
title: 'feat: Implement ''internalId'' via Collection Identity Hook'
state: CLOSED
labels:
  - enhancement
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T10:24:25Z'
updatedAt: '2026-02-10T01:10:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9070'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T01:10:21Z'
---
# feat: Implement 'internalId' via Collection Identity Hook

**Context:**
Currently, Neo.mjs relies on the record's primary key (`keyProperty`) for DOM element IDs (e.g., `view__1`). This presents several challenges:
1.  **Phantom Records:** New records have no ID (`null`), causing DOM ID collisions (`view__null`).
2.  **DOM Security:** Exposing database IDs in the DOM allows for enumeration attacks.
3.  **Stability:** Saving a record changes its ID (e.g., `-1` -> `100`), forcing a destructive DOM update.
4.  **Cross-Store Uniqueness:** Drag-and-drop between stores can lead to ID collisions if different entities share the same PK.

**Objective:**
Implement a stable, globally unique `internalId` (e.g., `neo-record-1`) for all data items (Records and Raw Objects), maintained via a lightweight Symbol property.

**Architecture: The "Identity Provider" Pattern**
To maintain the separation of concerns between `Neo.collection.Base` (dumb container) and `Neo.data.Store` (smart data manager), we will introduce an `itemFactory` hook.

**Implementation Plan:**

1.  **Define Symbol:**
    *   Create `src/util/Symbol.mjs` (or similar) to export `const internalId = Symbol.for('neoInternalId');`.

2.  **Enhance `Neo.collection.Base`:**
    *   Add `itemFactory` config (Function).
    *   Inside the `splice` method's addition loop, invoke the hook:
        ```javascript
        me.itemFactory?.(item);
        ```
    *   **Documentation:** Add intent-driven JSDoc explaining this is an injection point for item augmentation (like identity) without requiring inheritance.

3.  **Update `Neo.data.Store`:**
    *   Implement `assignInternalId(item)` method.
    *   In `construct`, bind this method to the `itemFactory` config.
    *   **Logic:**
        ```javascript
        if (!item[internalId]) {
            item[internalId] = Neo.getId('record');
        }
        ```

4.  **Update `Neo.data.RecordFactory`:**
    *   Ensure created Records also receive this symbol during instantiation.

5.  **Expose Accessor:**
    *   Add `store.getInternalId(item)` helper.

**Outcome:**
*   **Zero Iteration Overhead:** Piggybacks on the existing Collection map generation loop.
*   **Decoupled:** Collection remains ignorant of "Records".
*   **Secure & Stable:** Provides the foundation for immutable DOM identities.


## Timeline

- 2026-02-09T10:24:26Z @tobiu added the `enhancement` label
- 2026-02-09T10:24:27Z @tobiu added the `core` label
- 2026-02-09T10:45:45Z @tobiu referenced in commit `511e553` - "feat: Implement 'internalId' via Collection Identity Hook (#9070)"
### @tobiu - 2026-02-09T10:46:05Z

**Input from Gemini 3 Pro:**

> ✦ **Task Completed: Implement 'internalId' via Collection Identity Hook**
> 
> **Summary:**
> We have successfully implemented a robust, Symbol-based identity system that works seamlessly across "Turbo Mode" (raw objects) and standard Records, without polluting data or coupling Collections to the Store architecture.
> 
> **Key Implementations:**
> 
> 1.  **Symbol-Based Identity:**
>     *   Defined `Symbol.for('Neo.internalId')` in `src/core/ConfigSymbols.mjs`.
>     *   This ensures the ID property is non-enumerable (won't be sent to backend) and collision-free.
> 
> 2.  **Identity Provider Hook (Collection):**
>     *   Enhanced `src/collection/Base.mjs` with an `itemFactory` config.
>     *   The `splice` method now invokes `me.itemFactory?.(item)` for every new item.
>     *   **Architecture:** This keeps Collection "dumb" while allowing "smart" owners to inject logic.
> 
> 3.  **Store Integration:**
>     *   Updated `src/data/Store.mjs` to bind `assignInternalId` to the `itemFactory` hook.
>     *   Implemented lazy ID assignment: `item[internalId] = Neo.getId('record')`.
>     *   Added `getInternalId(item)` helper for easy access.
> 
> 4.  **Record Factory:**
>     *   Updated `src/data/RecordFactory.mjs` to automatically assign the `internalId` symbol upon Record instantiation.
> 
> **Outcome:**
> All data items managed by a Store now possess a stable, globally unique `neo-record-x` identity. This lays the foundation for:
> *   **Stable DOM IDs:** Decoupling DOM keys from mutable DB IDs.
> *   **Phantom Record Support:** Handling new records (id: null) without collisions.
> *   **Cross-Store D&D:** Unique identities across different stores.
> 
> **Next Steps:**
> Follow-up tickets will be created to leverage this new identity system in DOM rendering (Grid, List, etc.).

- 2026-02-09T10:48:30Z @tobiu cross-referenced by #9071
- 2026-02-09T10:50:10Z @tobiu cross-referenced by #9072
- 2026-02-09T10:50:14Z @tobiu cross-referenced by #9073
- 2026-02-09T10:51:44Z @tobiu cross-referenced by #9074
- 2026-02-09T12:18:07Z @tobiu cross-referenced by #9075
- 2026-02-09T13:46:25Z @tobiu cross-referenced by #9076
- 2026-02-10T01:10:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-10T01:10:21Z

resolved.

- 2026-02-10T01:10:21Z @tobiu closed this issue

