---
id: 9071
title: 'refactor: Adopt ''internalId'' for Stable DOM Keying (List & Data Views)'
state: CLOSED
labels:
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T10:48:29Z'
updatedAt: '2026-02-10T00:58:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9071'
author: tobiu
commentsCount: 3
parentIssue: 9074
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T00:58:23Z'
---
# refactor: Adopt 'internalId' for Stable DOM Keying (List & Data Views)

**Context:**
We have implemented a stable `internalId` (e.g., `neo-record-1`) for all store items via #9070.
Currently, `Neo.list.Base` and data views (`Gallery`, `Helix`) use the record's primary key (`keyProperty`) to generate DOM IDs (e.g., `view__100`).

**Problem:**
1.  **Phantom Records:** New records (`id: null`) cause DOM ID collisions.
2.  **Mutability:** Saving a record changes its ID (`-1` -> `100`), forcing a full DOM re-render.
3.  **Security:** Exposes database IDs in the DOM.

**Task:**
Update the base classes for Lists and Data Views to support using `internalId` for DOM keying.

**Requirements:**
1.  **Opt-in Config:** Add `useInternalId: true` (defaulting to `false` initially, or `true` if we are confident) to `Neo.list.Base` and `Neo.component.Gallery` / `Helix`.
2.  **Implementation:**
    *   Update `getItemId` and item creation logic to use `store.getInternalId(record)` when the config is enabled.
    *   Ensure selection models (`ListModel`, `GalleryModel`) respect this switch (comparing internal IDs vs record IDs).
3.  **Verification:** Test with CRUD scenarios (phantom records) and verify selection stability.

**Scope:**
- `src/list/Base.mjs`
- `src/component/Gallery.mjs`
- `src/component/Helix.mjs`
- Related Selection Models


## Timeline

- 2026-02-09T10:48:31Z @tobiu added the `refactoring` label
- 2026-02-09T10:48:31Z @tobiu added the `core` label
- 2026-02-09T10:51:44Z @tobiu cross-referenced by #9074
- 2026-02-09T10:52:02Z @tobiu added parent issue #9074
- 2026-02-09T11:04:55Z @tobiu cross-referenced by #9072
- 2026-02-09T13:48:00Z @tobiu referenced in commit `6d6569c` - "fix: Resolve Helix/Gallery Navigation, VNode Crash & Store Identity (#9071)

- **Store:** Fixed race condition in  ensuring  is bound before initial data load. Added lazy  assignment.
- **Helix/Gallery:** Fixed keyboard navigation by correcting index calculation logic. Fixed  crash (VNode ID & Record lookup).
- **ComboBox:** Fixed value update failure due to missing  on Records.
- **Refactor:** Updated all consumers to use robust record resolution."
### @tobiu - 2026-02-09T13:48:20Z

**Input from Gemini 3 Pro:**

> ✦ **Fix: Helix/Gallery Navigation, VNode Crash & Store Identity**
> 
> **Critical Fixes:**
> 
> 1.  **Store Identity Race Condition (`src/data/Store.mjs`):**
>     *   **Issue:** `itemFactory` was assigned *after* `super.construct`, causing initial data loads (e.g. ComboBox `data`, Helix `loadData` timing) to bypass `internalId` assignment.
>     *   **Fix:** Moved `itemFactory` assignment to the config object passed to `super.construct`.
>     *   **Enhancement:** Added "Lazy Assignment" to `getInternalId`. If an item lacks an ID (e.g. race condition), it is assigned on first access. This is a fail-safe.
> 
> 2.  **Helix & Gallery Navigation (`src/selection/HelixModel.mjs`, `GalleryModel.mjs`):**
>     *   **Issue:** `store.indexOf(selected)` returned `-1` because `selected` is an `internalId` but `indexOf` expects a PK/Record.
>     *   **Fix:** Refactored `onNavKey*` to first resolve the `record` from the `internalId` (using robust lookup), then find its index.
>     *   **Fix:** Updated logic to respect `view.maxItems`, preventing navigation into "ghost" items (loaded but not rendered).
> 
> 3.  **VNode ID Crash (`src/component/Helix.mjs`):**
>     *   **Issue:** `expandItem` created a new VDOM node without an ID, causing the VDOM Worker to reject the update.
>     *   **Fix:** Explicitly assigned a unique ID to the new node.
>     *   **Fix:** Updated `expandItem` and `destroyClones` to use robust record lookup (`store.items.find` fallback).
> 
> 4.  **ComboBox Value Update (`src/form/field/ComboBox.mjs`):**
>     *   **Issue:** Selection change event passed `internalId`, but `store.get` failed.
>     *   **Fix:** Updated `onListItemSelectionChange` to use the robust record lookup pattern.
> 
> **Refactor:**
> *   Updated `List.Base`, `ListModel`, `Gallery.mjs` to consistently use `getRecordId` and robust lookups.
> 
> **Outcome:**
> Helix/Gallery navigation, camera movement, expansion, and ComboBox selection are fully restored and robust against ID mismatches.

### @tobiu - 2026-02-09T13:51:30Z

**Input from Gemini 3 Pro:**

> ✦ **Correction: Helix Fully Restored, Others WIP**
> 
> To clarify the previous status update:
> 
> **✅ Helix Component (Fixed & Verified):**
> *   **Navigation:** Arrow key navigation is fully restored and respects `maxItems`.
> *   **Expansion:** `Enter` to expand/collapse works correctly (fixed `VNode` ID crash and `destroyClones` crash).
> *   **Camera:** Movement is synced with selection.
> *   **Bonus:** Fixed two pre-existing bugs related to VDOM ID generation and null pointer exceptions during collapse.
> 
> **⚠️ Work in Progress (ComboBox & Gallery):**
> While logic fixes were applied for `ComboBox` (value update) and `Gallery` (camera/selection), they require further verification to be considered "fully restored". The `Store` race condition fix is expected to resolve the underlying ID availability issues for these components, but they remain in a **WIP** state until confirmed.

- 2026-02-09T13:51:49Z @tobiu assigned to @tobiu
- 2026-02-10T00:39:03Z @tobiu referenced in commit `901636f` - "fix: Restore Gallery navigation and camera focus (#9071)

- CountryGallery: Use getRecordId for stable DOM IDs matching internalId.
- GalleryModel: Optimize selection lookup using store.get.
- Gallery: Fix camera focus by replacing deprecated updateDom with Neo.applyDeltas.
- Added unit test coverage for Gallery internalId support."
- 2026-02-10T00:53:45Z @tobiu referenced in commit `76fa476` - "fix: Resolve ComboBox value update failure with internalId (#9071)

- ComboBox: Parse DOM ID using list.getItemRecordId before store lookup.
- Added unit test to verify ComboBox selection with internalId."
### @tobiu - 2026-02-10T00:53:58Z

**Input from Gemini 3 Pro:**

> ✦ I have pushed the fix for `ComboBox` to the `dev` branch.
> 
> **Changes:**
> 1.  **`src/form/field/ComboBox.mjs`**:
>     *   **Fix:** Updated `onListItemSelectionChange` to parse the selected item's DOM ID using `list.getItemRecordId()` before attempting to retrieve the record from the store. This ensures compatibility with the new `internalId` system used by `List`.
> 2.  **Tests:**
>     *   Added `test/playwright/unit/form/field/ComboBoxInternalId.spec.mjs` to verify that `ComboBox` selection works correctly when the underlying `List` uses `internalId`.
> 
> **Outcome:**
> Selecting an item from the ComboBox picker now correctly updates the field's value. The mismatch between DOM IDs (prefixed) and Store IDs (raw) has been resolved.

- 2026-02-10T00:58:23Z @tobiu closed this issue

