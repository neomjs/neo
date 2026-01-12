---
id: 8163
title: Cross-Window Drag & Drop Refinement & Topology
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-27T21:26:45Z'
updatedAt: '2025-12-27T22:48:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8163'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 8160 Decouple and Configure Window Detachment Thresholds in SortZone'
  - '[x] 8161 Refine Cross-Window Drag Intersection to Target SortZone Rect'
  - '[ ] 8162 Fix Layout Corruption in Target Dashboard on Remote Drag Exit'
  - '[x] 8164 Enhance Neo.manager.Window to Track Full Window Geometry'
  - '[ ] 8165 Implement Configurable Theme Inheritance for Dragged Items'
  - '[ ] 8166 Implement Cross-Window Drop Validation and Topology Rules'
  - '[ ] 8167 Harden Return Trip Logic for Detached Items'
subIssuesCompleted: 2
subIssuesTotal: 7
blockedBy: []
blocking: []
---
# Cross-Window Drag & Drop Refinement & Topology

This epic tracks the advanced refinement and functional expansion of the Cross-Window Drag & Drop system ("Infinite Canvas").

**Scope:**
1.  **Theming Strategy:**
    *   Implement configurable behavior for dragged items: `themeMode: 'adapt' | 'retain'`.
    *   Ensure items dropped into a different app/window correctly adopt (or resist) the target's theme.

2.  **Topology & Validation (Sender/Receiver Rules):**
    *   Enhance `SortZone` validation to support asymmetric flows (e.g., Inner Dashboard -> Main Dashboard allowed, but Main -> Inner blocked).
    *   Implement `allowDrop(draggedItem, sourceZone)` hooks.

3.  **"Return Trip" Robustness (A -> B -> A):**
    *   Verify and harden the logic for dragging an item out of Window A, hovering Window B, and returning to Window A.
    *   Ensure state tracking (`detachedItems`) remains consistent and the original dashboard correctly reclaims its item without duplication or state loss.

4.  **Architecture & Documentation:**
    *   Review `DragCoordinator` responsibility (is it doing too much visual calculation?).
    *   Comprehensive JSDoc cleanup across `SortZone`, `DashboardSortZone`, and `DragCoordinator`.

## Timeline

- 2025-12-27T21:26:46Z @tobiu added the `epic` label
- 2025-12-27T21:26:46Z @tobiu added the `ai` label
- 2025-12-27T21:26:46Z @tobiu added the `architecture` label
- 2025-12-27T21:33:39Z @tobiu added sub-issue #8160
- 2025-12-27T21:33:42Z @tobiu added sub-issue #8161
- 2025-12-27T21:33:44Z @tobiu added sub-issue #8162
- 2025-12-27T21:33:46Z @tobiu added sub-issue #8164
- 2025-12-27T21:33:48Z @tobiu added sub-issue #8165
- 2025-12-27T21:33:50Z @tobiu added sub-issue #8166
- 2025-12-27T21:33:52Z @tobiu added sub-issue #8167
- 2025-12-27T22:48:29Z @tobiu assigned to @tobiu

