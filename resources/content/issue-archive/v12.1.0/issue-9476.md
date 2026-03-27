---
id: 9476
title: 'DevIndex: Add Contextual Rank Column to Grid'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-14T13:03:43Z'
updatedAt: '2026-03-14T16:34:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9476'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T16:32:08Z'
---
# DevIndex: Add Contextual Rank Column to Grid

The current "Index" column in the DevIndex grid reflects the row index of the currently filtered view. While this is technically correct, it causes users to lose their orientation when sorting the grid or searching for specific users.

We need to introduce a dedicated "Rank" column that accurately reflects a user's standing based on the active dataset context.

**Rules for Rank:**
1. **Global Base:** The initial data stream is pre-sorted by global rank. This is the baseline.
2. **Structural Filters:** Applying filters like "Country" or "Hireable" MUST recalculate the rank (e.g., to show a user's rank within their country).
3. **Immutability (Sorting):** Sorting the grid by a specific column (e.g., Followers) MUST NOT alter the assigned rank values.
4. **Immutability (Search Filters):** Applying search filters (e.g., Username, Bio) MUST NOT alter the assigned rank values.

**Refinement:**
We will *keep* the existing "Index" column but add the new "Rank" column right after it. This preserves the row counting functionality while providing the necessary contextual ranking data.

**Implementation Plan:**
1. Add a `rank` field to the `DevIndex.model.Contributor`.
2. Implement logic in `DevIndex.store.Contributors` to calculate `rank` based on the initial load order and recalculate it only when structural filters change.
3. Update `DevIndex.view.home.GridContainer` to include the new `rank` column adjacent to the `index` column.

## Timeline

- 2026-03-14T13:03:44Z @tobiu added the `enhancement` label
- 2026-03-14T13:03:44Z @tobiu added the `ai` label
- 2026-03-14T16:28:26Z @tobiu referenced in commit `57ab114` - "feat(DevIndex): Implement Contextual Rank via Post-Filter Analysis (#9476)"
- 2026-03-14T16:30:49Z @tobiu assigned to @tobiu
- 2026-03-14T16:31:29Z @tobiu cross-referenced by PR #9477
- 2026-03-14T16:32:08Z @tobiu referenced in commit `d0591e2` - "feat(DevIndex): Implement Contextual Rank via Post-Filter Analysis (#9476) (#9477)"
- 2026-03-14T16:32:08Z @tobiu closed this issue
### @tobiu - 2026-03-14T16:34:29Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Architectural Post-Mortem
> 
> This issue started as a straightforward task to replace the Grid's `index` column with a `rank` column but evolved into a deep dive into the performance mechanics of Neo.mjs's "Turbo Mode" and VDOM rendering.
> 
> **The Challenge:**
> We needed a contextual rank that recalculated based on "Structural" filters (e.g., Country) but remained static during "Search" filters (e.g., Username) and grid sorting.
> 
> **The Evolution of the Implementation:**
> 
> 1.  **Naive Override (Failed):** We initially tried overriding `Store:filter()` to calculate the rank on the fly. This was rejected because executing an `O(N)` calculation on 50,000 records on every keystroke during a text search is a performance disaster.
> 2.  **Cached Override with `setSilent` (Buggy UI):** We added a `needsCalculation` cache hash so the heavy lifting only occurred when Structural filters changed. To avoid an event storm (50k `recordChange` events), we used `record.setSilent({ rank: X })`. 
>     *   *The Flaw:* `setSilent` increments the Record's `version`, but if the array length and structure don't change (e.g., filtering a 1-row view to a 1-row view), the Grid's rendering engine might not visually update the row if the reference remains identical and the event is swallowed. The DOM became stale.
> 3.  **The "Map + Renderer" Pivot (Abandoned):** We tried decoupling the rank from the Record entirely by storing it in a `Map` and using a Grid column `renderer`.
>     *   *The Flaw:* This broke reactivity entirely. If the Record itself doesn't change, the Grid row is never re-rendered, meaning the `renderer` is never called to fetch the new Map value.
> 4.  **The Final Architecture (Post-Filter Analysis):**
>     The breakthrough was realizing we need to know the *exact visibility state* of the records before deciding how to mutate them. 
>     We enhanced the framework base classes (`Neo.collection.Base` and `Neo.data.Store`) by adding a `silent` parameter to their `filter()` methods.
> 
> **The Final Workflow (`DevIndex.store.Contributors`):**
> 1. We intercept `filter()`.
> 2. We calculate the new ranks into a temporary `newRanks` Map.
> 3. We execute `super.filter(silent: true)`. This builds the final `me._items` (the visible rows) without triggering the Grid.
> 4. We iterate the `newRanks` Map:
>    * If the item is a raw object, we mutate it directly (silent by nature).
>    * If the item is a `Record` AND it is in the `me._items` visible subset, we execute a loud update (`item.rank = X`). This fires `recordChange` specifically for the visible rows, guaranteeing the Grid's VDOM updates the DOM immediately.
>    * If the item is a `Record` but is HIDDEN, we execute `item.setSilent({ rank: X })`. This prevents the dreaded 50k event storm while keeping the data accurate for when the row eventually scrolls into view.
> 5. Finally, we manually fire the Store's `filter` event.
> 
> This architecture elegantly solves the "Stale UI vs. Event Storm" dilemma in high-performance virtualized grids.


