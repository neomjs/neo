---
id: 9069
title: 'Refactor: Collection.Base to use getKey() hook for Turbo Mode Support'
state: CLOSED
labels:
  - bug
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T02:48:41Z'
updatedAt: '2026-02-09T02:55:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9069'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-09T02:55:34Z'
---
# Refactor: Collection.Base to use getKey() hook for Turbo Mode Support

**Problem:**
 accesses  directly.
In Turbo Mode (Store), we use mapped keys (e.g.  but raw data has ).
Direct access returns , causing the Collection to generate negative IDs (, ) for items.

**Solution:**
1.  **Refactor :** Introduce  method (defaulting to direct access).
2.  **Update :** Replace all internal direct key access with .
3.  **:** Ensure its existing  override correctly handles the Reverse Mapping (Canonical -> Raw) logic.

**Result:**
The Collection will correctly resolve keys from Raw Objects even when using Canonical Key Properties, fixing the Grid ID regression without breaking Selection Models.

## Timeline

- 2026-02-09T02:48:41Z @tobiu assigned to @tobiu
- 2026-02-09T02:48:42Z @tobiu added the `bug` label
- 2026-02-09T02:48:42Z @tobiu added the `core` label
- 2026-02-09T02:50:44Z @tobiu changed title from **Fix: Grid IDs Regression & Store.getKey Reverse Mapping Support** to **Refactor: Collection.Base to use getKey() hook for Turbo Mode Support**
### @tobiu - 2026-02-09T02:55:04Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the regression where the Grid was displaying negative IDs (`-1`, `-2`).
> 
> **Analysis:**
> -   **Root Cause:** `Neo.collection.Base` accessed `item[this.keyProperty]` directly. In "Turbo Mode" (Store), `keyProperty` is `'login'`, but the raw item only has `'l'`. Direct access returned `undefined`, causing the Collection to generate new negative IDs.
> -   **Solution:** Refactored `Neo.collection.Base` to use a `getKey(item)` method (defaulting to direct access). This allows `Neo.data.Store` (which overrides `getKey`) to inject its smart "Reverse Mapping" logic (added in #9067).
> 
> **Changes:**
> 1.  **Refactored `src/collection/Base.mjs`:** Replaced direct `keyProperty` access with `getKey(item)`.
> 2.  **App Config:** `Contributors.mjs` remains `keyProperty: 'login'` (canonical), ensuring architectural correctness.
> 
> **Result:**
> The Grid now correctly identifies records using the mapped key (`l` -> `login`), displaying positive IDs and allowing correct selection behavior.

- 2026-02-09T02:55:18Z @tobiu referenced in commit `549c442` - "Refactor: Collection.Base to use getKey() hook for Turbo Mode Support (#9069)"
- 2026-02-09T02:55:34Z @tobiu closed this issue

