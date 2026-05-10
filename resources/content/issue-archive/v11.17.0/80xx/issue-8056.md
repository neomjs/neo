---
id: 8056
title: '[DomEvent] Implement Boundary-Aware Delegation Verification'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-08T06:45:34Z'
updatedAt: '2025-12-08T06:55:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8056'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-08T06:55:10Z'
---
# [DomEvent] Implement Boundary-Aware Delegation Verification

Update `Neo.manager.DomEvent.verifyDelegationPath` to implement a robust, boundary-aware check for event delegation.

**Current Behavior:**
The current implementation only verifies delegation targets against the physical DOM path. This causes verification failures for "logically" bubbled events (e.g., from a DragProxy to a Dashboard) where the target is not in the listener's physical DOM ancestry.

**Proposed Strategy:**
Implement a two-phase verification process to balance performance and correctness:

1.  **Phase 1: Physical Boundary Check (The Fast Path)**
    *   Iterate the raw `event.path` provided by the browser.
    *   Check if the `delegationTarget` is physically contained within the `listener.vnodeId`.
    *   If yes: Return valid (covers ~99% of cases with O(N) performance).
    *   If the loop ends without finding the listener's node: We have crossed a physical/logical boundary. Proceed to Phase 2.

2.  **Phase 2: Logical VNode Verification (The Fallback)**
    *   This phase runs **only** when the physical check fails.
    *   Retrieve the listener's component instance.
    *   Use `Neo.util.VNode.getById(listenerComponent.vnode, targetId)` to verify if the delegation target exists within the listener's **current** logical VNode tree.
    *   **Note:** `Neo.util.VNode.getById` already correctly handles recursion and resolves component references (via `getVnode`), so it will "tunnel" into child component VNodes as needed.

**Implementation Details:**
*   Modify `src/manager/DomEvent.mjs`.
*   Ensure `Neo.util.VNode` is imported (typically as `VNodeUtil`).
*   The fallback check should verify that `targetId` is findable starting from `listener.vnodeId` within the listener component's VNode tree.


## Timeline

- 2025-12-08T06:45:35Z @tobiu added the `enhancement` label
- 2025-12-08T06:45:35Z @tobiu added the `ai` label
- 2025-12-08T06:45:35Z @tobiu added the `architecture` label
- 2025-12-08T06:45:45Z @tobiu assigned to @tobiu
- 2025-12-08T06:53:38Z @tobiu referenced in commit `1c735a2` - "[DomEvent] Implement Boundary-Aware Delegation Verification #8056"
- 2025-12-08T06:55:10Z @tobiu closed this issue

