---
id: 8867
title: 'feat: Implement incremental updates for Card Layouts'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-01-23T18:13:14Z'
updatedAt: '2026-01-23T19:24:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8867'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# feat: Implement incremental updates for Card Layouts

**Description:**
Optimize `Neo.layout.Card` performance by implementing an "Incremental Update" strategy. This reduces the serialization and IPC overhead when switching between cards, especially in containers with many items or complex structures.

**Current Behavior:**
Switching a card triggers a full container update (`updateDepth: -1`). This causes the App Worker to build and serialize the entire VDOM tree (including inactive items) and sends it to the VDom Worker. While `removeInactiveCards: true` keeps the *live* DOM pruning efficient, the *VDOM* generation and message passing remain O(N) where N is the total complexity of all cards.

**Proposed Optimization:**
Introduce a new config `incrementalUpdates` (Boolean, default `true`) to `Neo.layout.Card`.

When `true`:
1.  The Container update is scoped to **depth 1** (Shell only).
2.  The **New Active Item** is explicitly registered for a **full update** (`depth: -1`) via `VDomUpdate.registerMerged()`. This ensures its entire subtree is serialized and rendered. This is CRITICAL as the item may be transitioning from a pruned state.
3.  The **Old Active Item** is registered for a **shell update** (`depth: 1`) via `VDomUpdate.registerMerged()`. This allows applying the `inactive` CSS class or `removeDom: true` flag while pruning its children (sending `neoIgnore` stubs).
4.  All other inactive items are automatically pruned by `TreeBuilder` at depth 1, effectively reducing the payload to O(1) (Active Card + Shells).

**Constraints & Requirements:**
-   **Default Value:** `true`.
-   **Move Operations:** This optimization relies on `neoIgnore` stubs. It is **incompatible** with DOM move operations involving these stubs. Layouts that perform DOM reordering (like `Cube` layout) or drag-and-drop scenarios must either disable this config or ensure the VDOM worker handles stub moves gracefully (currently risky).
-   **Animation:** Verify interaction with `slideDirection`.

**Acceptance Criteria:**
-   [ ] `incrementalUpdates` config added to `Neo.layout.Card` (default: `true`).
-   [ ] Logic implemented in `afterSetActiveIndex`.
-   [ ] Verify payload reduction (App -> VDom IPC).
-   [ ] Verify correct rendering of the new active card (full subtree appears).
-   [ ] Verify correct unmounting/hiding of the old active card.


## Timeline

- 2026-01-23T18:13:15Z @tobiu added the `enhancement` label
- 2026-01-23T18:13:15Z @tobiu added the `ai` label
- 2026-01-23T18:13:15Z @tobiu added the `performance` label
### @tobiu - 2026-01-23T19:24:01Z

**Input from Gemini 3 Pro:**

> ✦ ### Feasibility Analysis & Retrospective (2026-01-23)
> 
> We attempted to implement "Incremental Updates" for `Card` layout to optimize performance by reducing VDOM serialization and IPC payload. The goal was to switch `Card` layout updates from `updateDepth: -1` (Full Tree) to `updateDepth: 1` (Container Shell), while explicitly merging the **New Active Item** (Full) and **Old Active Item** (Shell).
> 
> #### The Approach
> 1.  **Strategy:** Use `VDomUpdate.registerMerged` to whitelist the active/inactive cards for expansion, while letting `TreeBuilder` prune all other items at `depth: 1`.
> 2.  **Mechanism:**
>     -   New Active Item: Registered with `depth: -1` (Full Expansion).
>     -   Old Active Item: Registered with `depth: 1` (Shell only, to toggle `removeDom` or CSS classes).
>     -   Others: Pruned by `TreeBuilder` (sent as `{componentId: ...}` placeholders).
> 
> #### The Roadblocks
> 
> **1. The Pruning vs. Preservation Conflict**
> When `TreeBuilder` prunes a component (because it's not active/merged), it sends a **Placeholder** (`{componentId: ...}`).
> -   **If the component was previously fully rendered:** `Helper` (VDom Worker) sees `New=Placeholder` vs `Old=Element`.
> -   **Standard Behavior:** `Helper` treats this as a node replacement. It removes the Element (destroying DOM content) and inserts the Placeholder. This wipes out the UI for inactive tabs that shouldn't be destroyed (if `removeInactiveCards: false`).
> -   **Attempted Fix:** We tried to use `neoIgnore: true` to tell `Helper` to "keep the existing DOM".
> 
> **2. State Desynchronization & Duplication**
> Using `neoIgnore` on a Placeholder creates a dangerous state desynchronization:
> -   **The Lie:** `Helper` receives a Placeholder and "accepts" it as the new VNode state, but *skips* DOM updates (leaving the full DOM tree intact).
> -   **The Consequence:** `Helper`'s internal state (and the `vnode` sent back to App Worker) now thinks the component is empty (Placeholder).
> -   **The Crash:** On the *next* update (when the card becomes active again), we send the Full Tree. `Helper` compares `New=Element` vs `Old=Placeholder`.
>     -   `Helper` sees that `Old` has 0 children. `New` has N children.
>     -   `Helper` generates `insertNode` for N children.
>     -   **Result:** These nodes are appended to the *existing* DOM nodes (which were never removed), causing **Content Duplication** (double rendering).
> 
> **3. The VNode Reference Integrity**
> The App Worker relies on `component._vnode` to track mounted state.
> -   When `Helper` returns the Placeholder (from the "pruned" update), `syncVnodeTree` updates `component._vnode` to the Placeholder.
> -   This wipes out the App Worker's knowledge of the component's internal structure.
> -   Subsequent logic relying on `vnode` traversal (e.g., `onScrollCapture` looking up IDs, or `TreeBuilder` recursion) fails or errors (`Cannot read properties of null`).
> 
> **4. Recursive Merging Gaps**
> We discovered that `VDomUpdate.getMergedChildIds` did not natively support recursive merging (Grandchild -> Child -> Parent).
> -   If a Grandchild updated (merged to Child) and the Child updated (merged to Parent), the Parent's `TreeBuilder` only saw the Child as "dirty", not the Grandchild.
> -   Result: The Grandchild was aggressively pruned, losing its update.
> 
> #### Conclusion
> The "Incremental Update" strategy requires a fundamental architectural change in how `Helper` and `TreeBuilder` handle pruning.
> To make this work, **Pruning** must be distinguishable from **removal**.
> -   **Current:** Pruning = Placeholder. Placeholder = "Empty Node".
> -   **Required:** Pruning = "Keep Existing State".
>     -   This requires `Helper` to *copy* the Old VNode (Full Tree) into the New VNode structure when ignoring/pruning, so that the state remains "Full".
>     -   We attempted this ("State Swap" fix), but it introduced significant complexity and regression risks in `RealWorldUpdates` tests, indicating edge cases in diffing mixed trees (Placeholder vs Element).
> 
> For now, the complexity and risk of destabilizing the core VDOM engine outweigh the performance benefits. Future attempts should focus on enabling `Helper` to safely "carry forward" full trees when receiving placeholders, effectively allowing "Sparse VDOM Updates" without state corruption.


