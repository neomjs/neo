---
id: 8874
title: Investigate addVnodeComponentReferences Data Loss & TreeBuilder Symmetry
state: OPEN
labels:
  - discussion
  - ai
  - testing
  - core
assignees: []
createdAt: '2026-01-23T23:30:52Z'
updatedAt: '2026-01-23T23:40:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8874'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate addVnodeComponentReferences Data Loss & TreeBuilder Symmetry

**Context:**
`ComponentManager.addVnodeComponentReferences` flattens a Full VNode tree into References.
It creates references as `{componentId, id}`.
**Crucially, it discards all other properties (`style`, `cls`, etc.) from the node.**

**Problem:**
When `syncVnodeTree` applies this flattening to a component (e.g. `Child`), `Child._vnode` becomes a "naked" reference.
In the next update, `TreeBuilder` generates a "rich" reference from `vdom` (containing `style`, etc.).
`Helper` compares "Naked Old Reference" vs "Rich New Reference".
Result: **Attribute Mismatch** -> Unnecessary Deltas.

**Baseline Behavior:**
In the baseline, `syncVnodeTree` often skipped children (due to `getChildIds` filtering placeholders). `Child._vnode` remained Full.
`Helper` compares "Rich New Reference" vs "Full Old Node".
It seems `Helper` handles this "Pruning" case gracefully (ignoring the Full content).

**Goal:**
1.  Confirm `Helper`'s behavior for Reference vs Full (Pruning logic).
2.  Investigate if `addVnodeComponentReferences` SHOULD preserve attributes (creating "Rich References").
    *   If it did, `syncVnodeTree` could safely flatten trees without causing diffs.
    *   This would align `_vnode` state more consistently with the "Placeholder" concept.

**Tasks:**
1.  Create unit tests demonstrating "Naked Reference" vs "Rich Reference" diffs in `Helper`.
2.  Prototype `addVnodeComponentReferences` preserving attributes.
3.  Evaluate impact on `syncVnodeTree` logic.

This explains the "Extra Delta" regression encountered in #8868.

## Timeline

- 2026-01-23T23:31:00Z @tobiu added the `discussion` label
- 2026-01-23T23:31:00Z @tobiu added the `ai` label
- 2026-01-23T23:31:00Z @tobiu added the `testing` label
- 2026-01-23T23:31:00Z @tobiu added the `core` label
### @tobiu - 2026-01-23T23:33:48Z

**Input from Gemini 3 Pro:**

> ✦ **Refinement based on Architectural Intent:**
> 
> The user clarified the intended architecture:
> 1.  `vdom` contains lightweight references (componentId + id).
> 2.  `addVnodeComponentReferences()` is **intended** to flatten VNode trees into this **exact same shape**.
> 3.  `TreeBuilder` is then expected to expand both (if needed) in an identical way.
> 
> **Investigation Pivot:**
> The "Attribute Mismatch" theory might be incorrect if `vdom` references are indeed naked.
> The investigation should focus on:
> 1.  Verifying that `vdom` references and `addVnodeComponentReferences` outputs are indeed **structurally identical**.
> 2.  Checking if `TreeBuilder` respects this symmetry under all `depth` conditions.
> 3.  Understanding why the "Extra Delta" occurred in #8868 when we enforced this flattening (via `syncVnodeTree`). It implies that for that specific test case, the "Flattened" state produced a different result than the "Full" state, which shouldn't happen if the pruning logic is perfect.
> 
> This ticket should verify the "Happy Path" symmetry and identify why it drifted in the regression case.

### @tobiu - 2026-01-23T23:36:59Z

**Input from Gemini 3 Pro:**

> ✦ **Final Architecture Confirmation:**
> 
> The user provided further evidence from `Container.Base.insert`, which also uses `createVdomReference()`.
> This confirms that the **VDOM protocol** is strictly:
> *   **Containers/Parents** hold **References** (`{componentId}`) to their children.
> *   **Components** hold their own **Full VDOM** (`_vdom`).
> *   **TreeBuilder** is the bridge that expands References into Full Trees for the Worker.
> *   **addVnodeComponentReferences** is the inverse bridge, flattening Worker Full Trees back into References for the App.
> 
> **Conclusion for Investigation:**
> The "Data Loss" hypothesis is definitely incorrect because the "Lost Data" (attributes on placeholders) *should not exist* in the VDOM reference model.
> The investigation in this ticket must focus on why the **Transition** (from Full to Flattened) triggered a reaction in `Helper` in the specific regression case. It implies `Helper` or `TreeBuilder` handled the "Flattened" structure differently than the "Full" structure in a way that produced a delta, despite them being logically equivalent after expansion.
> 
> This ticket is now purely about verifying and hardening this **Symmetry**.

### @tobiu - 2026-01-23T23:40:50Z

**Input from Gemini 3 Pro:**

> ✦ **Insights from Documentation (v10 Deep Dive & Asymmetric Updates):**
> 
> 1.  **Architectural Intent:** The documentation explicitly states that a container's `vdom` property "just lists its children" (references), and `TreeBuilder` is responsible for "intelligently expanding" them. This confirms that `syncVnodeTree`'s role in flattening the structure (via `addVnodeComponentReferences`) is architecturally correct: it resets the component's state to the "Reference Model" after a "Full Model" update from the worker.
> 
> 2.  **The "Extra Delta" Mystery:** Since `TreeBuilder` expands references into full structures before sending to `Helper`, the "Flattened" state (in App Worker) and "Full" state (in VDom Worker) should theoretically produce identical expanded outputs for `Helper` to compare. The fact that they don't (causing the regression) suggests that `addVnodeComponentReferences` might be **lossy** in a way that `TreeBuilder` cannot recover from.
> 
> **Hypothesis:** `addVnodeComponentReferences` might be stripping **Wrapper Nodes** or specific structural metadata that `TreeBuilder` relies on to reconstruct the full tree correctly. If `TreeBuilder` expands a "Naked Reference" differently than a "Reference with Wrapper Metadata", `Helper` will see a mismatch.
> 
> **Action Item:** Investigate if `addVnodeComponentReferences` correctly handles wrapped components and preserves necessary metadata for `TreeBuilder`.


