---
id: 8834
title: 'Architecture: Implement ''vdom.Helper.updateBatch'' for Disjoint Updates'
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T18:56:11Z'
updatedAt: '2026-01-20T20:06:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8834'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Architecture: Implement 'vdom.Helper.updateBatch' for Disjoint Updates

**Context:**
To eliminate the O(N) depth overhead of "Bridge Paths" in Leapfrog Merging, we want to switch to a "Batched Disjoint Update" model ("Teleportation").

**Constraint:**
A Component Tree resides in a single `windowId`. However, the `VDomUpdate` manager handles the entire App, which may span multiple windows.

**Proposed Architecture:**

1.  **New Worker API:** `vdom.Helper.updateBatch(updates: Array)`
    -   Accepts an array of update payloads.
    -   Iterates sequentially, applying each update to the VNode tree.
    -   Accumulates all generated deltas into a single return array.

2.  **Manager Logic (`VDomUpdate.mjs`):**
    -   Identify updates that are part of a transaction (merged).
    -   **Group by `windowId`:** We cannot send updates for Window A and Window B in the same VDOM message payload if the message structure implies a specific target window context. (Though `applyDeltas` separates by windowId, `vdom.Helper` might need context).
    -   Dispatch `updateBatch` instead of building a bridged tree.

**Benefits:**
-   **Performance:** Zero overhead for deep updates. No "Bridge" components expanded.
-   **Simplicity:** Removes complex "Bridge Path" calculation from `VDomUpdate` and "Pruning" logic from `TreeBuilder`.
-   **Concurrency:** "Clean" intermediate components are truly untouched, allowing disjoint subtrees to update freely.

**Tasks:**
-   Prototype `vdom.Helper.updateBatch`.
-   Update `VDomUpdate` to batch disjoint updates instead of merging.

## Timeline

- 2026-01-20T18:56:12Z @tobiu added the `ai` label
- 2026-01-20T18:56:13Z @tobiu added the `architecture` label
- 2026-01-20T18:56:13Z @tobiu added the `performance` label
- 2026-01-20T18:56:13Z @tobiu added the `core` label
- 2026-01-20T18:56:44Z @tobiu assigned to @tobiu
- 2026-01-20T19:49:00Z @tobiu added the `epic` label
- 2026-01-20T20:05:25Z @tobiu referenced in commit `9e2a82e` - "feat: Implement Batched Disjoint VDOM Updates (WIP) (#8834)"
### @tobiu - 2026-01-20T20:06:14Z

**Input from Gemini 3 Pro:**

> ✦ # Exploration Summary: Batched Disjoint VDOM Updates
> 
> This comment summarizes the architectural exploration, implementation attempts, and current status of the "Batched Disjoint VDOM Updates" (Teleportation) feature.
> 
> ## Goal
> Eliminate the O(N) overhead of "Bridge Path" expansion in Leapfrog Merging by switching to a **Teleportation Model**. Instead of merging child updates into the parent's VDOM tree (requiring the expansion of clean intermediate nodes), we want to send the parent and its dirty descendants as separate, disjoint payloads in a single `updateBatch` message.
> 
> ## Architecture
> 
> 1.  **Worker API:** `vdom.Helper.updateBatch(updates: Array)`
>     -   Implemented. Accepts an array of payloads and processes them sequentially.
>     -   Returns an aggregated result object with `deltas` and `results` (VNodes).
> 
> 2.  **Manager Logic (`VDomUpdate` & `VdomLifecycle`):**
>     -   **Batch Collection:** `executeVdomUpdate` now recursively collects payloads from the component and all its `mergedChildIds`.
>     -   **Disjoint Boundary:** The Parent component (and any component in the batch) MUST generate a VDOM tree that **prunes** its merged children (replaces them with placeholders). This prevents the Parent from "owning" the child's DOM, allowing the Child's disjoint payload to update it directly.
> 
> ## Key Challenges & Findings
> 
> ### 1. The "Double Update" Regression
> **Symptom:** `RealWorldUpdates` tests failed with "Received 3 deltas, Expected 2". The logs showed duplicate `textContent` updates for the same component.
> **Cause:** `TreeBuilder` was expanding the child inside the parent *despite* `mergedChildIds` being passed (or because of it).
> -   **Root Cause:** `VdomLifecycle.updateVdom` calls `VDomUpdate.getAdjustedUpdateDepth`. This legacy logic increases the parent's `updateDepth` (e.g., from 1 to 2) to cover the distance to the child.
> -   **Impact:** When `updateDepth > 1`, `TreeBuilder` expands children, even if we wanted disjoint updates. This resulted in:
>     1.  Parent Update (Nested Child) -> Delta 1.
>     2.  Child Update (Disjoint Batch) -> Delta 2.
> **Fix:** Explicitly pass `depth: 1` to `getVdomUpdatePayload` in `executeVdomUpdate`. This forces `TreeBuilder` to prune children, ensuring the Parent VDOM is truly disjoint.
> 
> ### 2. The "Missing Child" Regression
> **Symptom:** Merging tests failed with "Received 2, Expected 4". Child and Grandchild updates were missing.
> **Cause:** The batch collection loop in `executeVdomUpdate` only iterated the *direct* merged children of the parent. In a chain (Grandchild -> Child -> Parent), the Grandchild was hidden inside the Child's transaction. Since the Child was pruned (Disjoint), the Grandchild was never added to the batch.
> **Fix:** Implemented a **Recursive Batch Collector** in `executeVdomUpdate` to flatten the merge graph.
> 
> ### 3. The "Undefined Resolution" Crash
> **Symptom:** Tests failed with `TypeError: Cannot read properties of undefined (reading 'find')`.
> **Cause:**
> -   **Phantom Callbacks:** `initVnode` calls `resolveVdomUpdate` (correct). But `syncVnodeTree` sets `child.mounted = true`.
> -   **Abstract.mjs Trigger:** `src/component/Abstract.mjs` has an `afterSetMounted` hook that calls `VDomUpdate.executeCallbacks(me.id)`. This was firing callbacks with `undefined` data because the update hadn't actually produced data yet (it was just a mount).
> -   **Fix:** Updated `Abstract.mjs` to pass a fallback object `{vnode: me.vnode, deltas: []}`. Updated `initVnode` to pass `{deltas: []}`.
> 
> ### 4. The "Incomplete Resolution" Bug
> **Symptom:** `executeVdomUpdate` was resolving the parent promise with an object containing `vnode` but missing `deltas`.
> **Cause:** A redundant `resolveVdomUpdate` call inside the `response.results.forEach` loop was using the raw `result` object (from `Helper`), which only contained `vnode`.
> **Fix:** Removed the redundant call. Now resolving once at the end with the aggregated `response` (containing `deltas`).
> 
> ## Current Status (Branch `epic-8834`)
> 
> The branch contains the following WIP changes:
> -   `src/vdom/Helper.mjs`: Implements `updateBatch`.
> -   `src/manager/VDomUpdate.mjs`: Added JSDoc, fixed `delete` vs `remove`.
> -   `src/mixin/VdomLifecycle.mjs`:
>     -   `executeVdomUpdate` rewritten for recursive, disjoint batching.
>     -   `getVdomUpdatePayload` accepts `depth` override.
>     -   `initVnode` passes valid data to resolution.
> -   `src/component/Abstract.mjs`: `afterSetMounted` passes fallback data.
> 
> **Known Issues:**
> -   `RealWorldUpdates.spec.mjs` still fails with "Received 3 vs 2" in some cases, and "Received 2 vs 4" in others.
> -   The "Double Update" seems persisted or re-introduced despite the `depth=1` fix.
> -   `RaceCondition` tests are unstable or failing due to delta count mismatches.
> 
> **Next Steps:**
> 1.  Isolate `TreeBuilder` behavior: Verify why it might still be expanding children.
> 2.  Review `Abstract.mjs` logic: Does triggering callbacks on mount create a race condition with the actual update?
> 3.  Consider simplifying `VDomUpdate` manager further by removing `adjustedDepth` logic entirely if we commit to Disjoint Updates.


