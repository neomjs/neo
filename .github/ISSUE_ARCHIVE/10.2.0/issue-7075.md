---
id: 7075
title: Enable Granular VDOM Updates for Functional Components
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-16T12:50:14Z'
updatedAt: '2025-07-28T11:16:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7075'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-28T11:16:22Z'
---
# Enable Granular VDOM Updates for Functional Components

**Reported by:** @tobiu on 2025-07-16

---

**Parent Issue:** #6992 - Functional Components

---

## Problem

The rendering logic for functional components had a significant performance limitation. When a functional component hosted other components, it would default to setting its `updateDepth` to `-1` for any update that involved children.

The core issue relates to how newly created child components are rendered. When a new child is instantiated, the parent functional component's VDOM contains only a lightweight `vdomReference` to it. For the main thread to render the new child, the parent's VDOM update payload must be deep enough (`updateDepth >= 2`) to replace that reference with the child's full initial VDOM.

The old logic used `updateDepth = -1` as a blunt instrument to solve this for creations, but it was also applied inefficiently to simple updates of existing children, forcing a full subtree serialization and bypassing the performance benefits of scoped VDOM updates.

## Solution

The logic within `functional/component/Base.mjs` has been enhanced to intelligently differentiate between the creation of new child components and updates to existing ones.

1.  **Intelligent `updateDepth`:** The `onEffectRunStateChange` method now dynamically sets the `updateDepth`.
    *   **On Update:** For normal updates where only the configs of existing children change, the `updateDepth` remains at its default (`1`). This allows child components to manage their own scoped updates, resulting in maximum performance.
    *   **On Creation:** When the component's effect run creates one or more *new* child components, the `updateDepth` is temporarily set to `2`. This ensures that the initial VDOM of the newly created children is correctly included in the parent's render cycle.

2.  **Detection Mechanism:** The logic detects new children by comparing the keys of the `childComponents` map (the state before the effect run) with the keys of the `#nextChildComponents` map (the state after the effect run).

3.  **Code Clarity:** As part of this change, the internal property `#newChildComponents` was renamed to `#nextChildComponents` to more accurately reflect its purpose, improving the maintainability of the code.

This change fixes a major performance bottleneck and aligns the update behavior of functional components with the highly efficient, scoped update model of classic components.

