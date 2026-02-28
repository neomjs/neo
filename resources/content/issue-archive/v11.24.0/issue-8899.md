---
id: 8899
title: App-Worker Authority for VDOM IDs
state: CLOSED
labels:
  - epic
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-01-28T15:29:31Z'
updatedAt: '2026-01-28T17:41:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8899'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 8900 Implement JIT ID Generation in TreeBuilder'
  - '[x] 8901 Remove Obsolete ID Sync Logic from VDom.mjs'
  - '[x] 8902 Verify VDOM ID Architecture Stability & Fix Tests'
  - '[x] 8903 Implement Scoped Deterministic IDs for Functional Components'
  - '[x] 8904 Verify Scoped Deterministic ID Generation for Functional Components'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-01-28T17:41:03Z'
---
# App-Worker Authority for VDOM IDs

**Objective:**
Eliminate VDOM ID corruption and "Node Stealing" bugs (like #8898) by making the App Worker the **sole authority** for ID generation.

**Context:**
Currently, VDOM IDs are often generated lazily in the VDOM Worker when `initVnode` or `update` logic runs. This creates a state mismatch where the App Worker's VDOM tree (the blueprint) lacks IDs that the VDOM Worker's VNode tree (the DOM representation) has. We rely on complex, brittle heuristics in `syncVnodeTree` to retroactively map these IDs back. This logic fails during disjoint updates or structural shifts (like Grid recycling), leading to corruption.

**Strategy:**
Shift ID generation to the **App Worker** *before* the VDOM payload is sent.
1.  **Authority:** `TreeBuilder` (App Worker) assigns immutable IDs to any VDOM node that lacks them during the build phase.
2.  **Persistence:** These IDs are assigned in-place to the VDOM object, ensuring they persist for the lifetime of the component.
3.  **Strictness:** The VDOM Worker (`VNode.mjs`) will now **throw an error** if it receives a node without an ID, enforcing the new contract.
4.  **Simplification:** The brittle ID syncing logic in `VDom.mjs` and `VdomLifecycle.mjs` becomes obsolete and will be removed.

**Implementation Plan:**
1.  **Ticket 1:** Implement JIT ID Generation in `TreeBuilder.mjs` (App Authority).
2.  **Ticket 2:** Remove obsolete ID Sync logic from `VDom.mjs` and `VdomLifecycle.mjs`.
3.  **Ticket 3:** Verify Stability and fix regressions in Test Suite.

**Impact:**
- **Deterministic State:** No more "guessing" which node is which.
- **Performance:** Slight O(n) cost in App Worker offset by removal of O(n) syncing cost.
- **Robustness:** Eliminates an entire class of synchronization bugs.


## Timeline

- 2026-01-28T15:29:32Z @tobiu added the `epic` label
- 2026-01-28T15:29:32Z @tobiu added the `ai` label
- 2026-01-28T15:29:32Z @tobiu added the `architecture` label
- 2026-01-28T15:29:32Z @tobiu added the `core` label
- 2026-01-28T15:34:13Z @tobiu added sub-issue #8900
- 2026-01-28T15:34:18Z @tobiu added sub-issue #8901
- 2026-01-28T15:34:21Z @tobiu added sub-issue #8902
- 2026-01-28T16:41:02Z @tobiu assigned to @tobiu
- 2026-01-28T17:09:03Z @tobiu added sub-issue #8903
- 2026-01-28T17:19:33Z @tobiu added sub-issue #8904
### @tobiu - 2026-01-28T17:40:25Z

**Input from Gemini 3 Pro:**

> ✦ # Architecture Shift Complete: App-Worker Authority for VDOM IDs
> 
> This Epic marks a significant milestone in the Neo.mjs rendering engine architecture. We have successfully transitioned VDOM ID generation from a **reactive, worker-dependent model** to a **proactive, App-Authority model**.
> 
> ## The Core Shift
> 
> ### Before (Worker-First)
> - **Mechanism:** The App Worker often sent VDOM nodes *without* IDs. The VDOM Worker (or `Helper`) would lazily generate IDs (`neo-vnode-X`) upon receipt.
> - **The Flaw:** This created a split-brain state where the App Worker's blueprint (`vdom`) did not match the VDOM Worker's reality (`vnode`). We relied on complex, brittle heuristics (`syncVnodeTree`) to "guess" which new App node corresponded to which old Worker node to sync IDs back. This logic fundamentally failed during disjoint updates or structural shifts (like Grid recycling), leading to "Node Stealing" (ID corruption).
> 
> ### After (App-First)
> - **Mechanism:** The App Worker (`TreeBuilder`) acts as the **Sole Authority**. It ensures *every* node has an immutable ID *before* the payload leaves the thread.
> - **The Fix:** Since the App Worker dictates identity, there is no ambiguity. The VDOM Worker simply accepts the IDs provided. We no longer need to "sync back" IDs, eliminating an entire class of synchronization bugs. `src/vdom/VNode.mjs` now strictly enforces this by throwing an error if it receives a node without an ID (in production).
> 
> ## Functional Component Innovation: "Scoped Deterministic IDs"
> 
> A major challenge was adapting this "stateful" architecture to **Functional Components**, which are inherently stateless (generating fresh VDOM objects on every render).
> 
> **The Solution:**
> We implemented **Scoped Deterministic ID Generation** in `Neo.functional.component.Base`.
> - **Logic:** Instead of random IDs, we generate IDs based on the component's structure: `componentId__scope__index`.
> - **Shielding:** Developers can "shield" sub-trees from index shifts by assigning a custom `id` to a container. This starts a new ID scope (prefix), ensuring that inserting a node *before* the container does not cascade ID changes into the container's children.
> - **Result:** Functional components now enjoy **stable, persistent identity** across re-renders without needing to read from the VDOM Worker's state. This enables efficient, granular DOM updates even for stateless views.
> 
> ## Verification & Stability
> 
> - **Unit Tests:** The entire VDOM unit test suite (256 tests) has been stabilized and updated to enforce the new strict ID contract.
> - **New Coverage:** Dedicated test suites (`test/playwright/unit/functional/IdGeneration.spec.mjs` and `test/playwright/unit/component/IdGeneration.spec.mjs`) explicitly verify the stability and persistence of the new ID generation strategies.
> 
> **Outcome:**
> The rendering engine is now more deterministic, robust, and easier to debug. "Node Stealing" is structurally impossible under the new model.

### @tobiu - 2026-01-28T17:40:44Z

<img width="545" height="275" alt="Image" src="https://github.com/user-attachments/assets/3a3a397c-c335-4f55-8281-ad87a75ed275" />

- 2026-01-28T17:41:03Z @tobiu closed this issue

