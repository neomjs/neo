---
id: 8058
title: '[DomEvent] Implement Physical Anchor Verification for Delegation'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-08T08:38:20Z'
updatedAt: '2025-12-10T14:07:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8058'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T14:07:48Z'
---
# [DomEvent] Implement Physical Anchor Verification for Delegation

Refactor `Neo.manager.DomEvent.verifyDelegationPath` to implement a simplified, robust "Physical Anchor" verification strategy.

**Context:**
Previous iterations considered complex VNode traversals to bridge the gap between physical DOM paths and logical component hierarchies (e.g., Portals, Multi-Window). However, since `DomEvent.fire()` now utilizes `ComponentManager.getParentPath()` to resolve the full logical component chain before verification, we can rely on this pre-calculated truth.

**The Problem:**
Delegation verification failed for detached components because the `listener.vnodeId` was not present in the raw physical `event.path`.

**The Solution: Physical Anchor Verification**
We implemented a 2-phase strategy that bridges the physical and logical worlds without expensive VNode scans.

1.  **Phase 1: Physical Boundary Check (Fast Path)**
    *   Standard check: Is `listener.vnodeId` in the physical `path`?
    *   If yes, the target is physically inside the listener. Valid.

2.  **Phase 2: Physical Anchor Verification (Logical Fallback)**
    *   If Phase 1 fails, we check the `componentPath` (logical chain).
    *   We identify the **"Anchor Component"**: The first component ID in `componentPath` (which corresponds to the first component found in the physical path by `getParentPath`).
    *   We verify that the `targetId` (found by the delegate selector) is **physically inside** (or is) this Anchor Component.
    *   **Logic:** Target is inside Anchor (Physical) -> Anchor is inside Listener (Logical, via `componentPath`). Therefore, Target is inside Listener.

**Benefits:**
*   **Performance:** O(N) on path length. No recursive VNode tree traversals.
*   **Robustness:** Correctly handles Portals (Anchor = Portal Child), Menus (Anchor = SubMenu), and Multi-Window apps (Anchor = View in Window B).
*   **Simplicity:** Leverages the existing "Single Source of Truth" (`componentPath`) rather than re-deriving relationships.

**Changes:**
*   Updated `src/manager/DomEvent.mjs`.
*   Added comprehensive tests in `test/playwright/unit/manager/domEvent/Delegation.spec.mjs` covering all scenarios.


## Timeline

- 2025-12-08T08:38:21Z @tobiu added the `enhancement` label
- 2025-12-08T08:38:21Z @tobiu added the `ai` label
- 2025-12-08T08:38:22Z @tobiu added the `refactoring` label
- 2025-12-08T08:38:22Z @tobiu added the `architecture` label
- 2025-12-08T08:38:39Z @tobiu assigned to @tobiu
- 2025-12-08T08:39:21Z @tobiu referenced in commit `a6e475a` - "[DomEvent] Implement Physical Anchor Verification for Delegation #8058"
- 2025-12-10T14:07:48Z @tobiu closed this issue

