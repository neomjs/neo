---
id: 8057
title: '[DomEvent] Implement 3-Phase Boundary-Aware Delegation Verification'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-08T07:32:26Z'
updatedAt: '2025-12-08T07:34:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8057'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-08T07:34:30Z'
---
# [DomEvent] Implement 3-Phase Boundary-Aware Delegation Verification

Refactor `Neo.manager.DomEvent.verifyDelegationPath` to support robust, boundary-aware delegation verification for complex component hierarchies.

**Problem:**
The previous implementation only verified delegation targets against the physical DOM path. This caused failures for:
1.  **Detached VDOM Components:** Components physically rendered elsewhere (e.g., Portals, DragProxies) but present in the listener's VDOM.
2.  **Logical Child Components:** Components linked via `parentComponent` (e.g., Floating Menus) which are neither physically nested nor in the listener's VDOM.

**Solution:**
Implement a **3-Phase Verification Strategy** in `verifyDelegationPath` to balance performance and correctness:

1.  **Phase 1: Physical Boundary Check (The Fast Path)**
    *   Iterates the raw `event.path` provided by the browser.
    *   Checks if the `delegationTarget` is physically contained within the `listener.vnodeId`.
    *   **Performance:** Covers ~99% of standard inline events with O(N) efficiency.

2.  **Phase 2: Logical VNode Verification (The VDOM Fallback)**
    *   Triggered only if Phase 1 fails.
    *   Uses `Neo.util.VNode.getById(listenerComponent.vnode, targetId)` to verify if the target exists within the listener's **logical VNode tree**.
    *   **Use Case:** Portals, DragProxies, and other VDOM-connected but physically detached components.
    *   **Note:** correctly resolves component references to "tunnel" into child component VNodes.

3.  **Phase 3: Logical Component Path Verification (The Last Resort)**
    *   Triggered only if Phase 2 fails.
    *   Checks the logical `componentPath` (constructed via `ComponentManager` from `parent`/`parentComponent` chains).
    *   Verifies that the target's component ID is logically "below" or same as the listener's component ID in the hierarchy.
    *   **Use Case:** Floating Menus and other purely logical children (linked via `parentComponent`) that are roots of their own VDOM trees.

**Changes:**
*   Modified `src/manager/DomEvent.mjs` to implement the 3-phase logic.
*   Added `test/playwright/unit/manager/domEvent/Delegation.spec.mjs` with comprehensive test cases for all scenarios:
    *   Physical nesting (Standard)
    *   VDOM connection (Portal/Proxy)
    *   Logical connection (Menu/ParentComponent)
    *   Negative case (Random element)


## Timeline

- 2025-12-08T07:32:27Z @tobiu added the `enhancement` label
- 2025-12-08T07:32:27Z @tobiu added the `ai` label
- 2025-12-08T07:32:27Z @tobiu added the `testing` label
- 2025-12-08T07:32:27Z @tobiu added the `architecture` label
- 2025-12-08T07:32:41Z @tobiu assigned to @tobiu
- 2025-12-08T07:33:54Z @tobiu referenced in commit `985249a` - "[DomEvent] Implement 3-Phase Boundary-Aware Delegation Verification #8057"
- 2025-12-08T07:34:30Z @tobiu closed this issue

