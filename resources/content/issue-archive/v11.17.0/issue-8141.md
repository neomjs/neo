---
id: 8141
title: 'SortZone: Animate dashboard items to fill space during window drag'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-19T11:01:04Z'
updatedAt: '2025-12-19T12:46:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8141'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T12:46:00Z'
---
# SortZone: Animate dashboard items to fill space during window drag

**Objective:**
Improve the UX when dragging a dashboard item out into a new window. Currently, the placeholder remains, leaving a "hole" in the dashboard layout.

**Desired Behavior:**
1.  **On Drag Exit (Window Drag Start):**
    *   The placeholder should be hidden.
    *   The remaining dashboard items should animate (grow/slide) to fill the available space, as if the dragged item was removed.
2.  **On Drag Re-entry:**
    *   The dashboard items should animate back (shrink/slide) to their original "sort mode" positions.
    *   The placeholder should reappear.

**Technical Strategy:**
*   **CSS:** Update `SortZone.scss` to include `width` and `height` in `transition-property` to enable smooth resizing.
*   **JS (SortZone):**
    *   Implement a "Snapshot" system to cache the original layout state.
    *   Implement a `calculateFlexLayout` helper to compute the "expanded" layout for the remaining items (respecting `flex` and fixed dimensions).
    *   In `startWindowDrag`, apply the "expanded" styles and hide the placeholder.
    *   In `onDragBoundaryEntry` (or equivalent re-entry hook), restore the cached "original" styles and show the placeholder.


## Timeline

- 2025-12-19T11:01:05Z @tobiu added the `enhancement` label
- 2025-12-19T11:01:05Z @tobiu added the `ai` label
- 2025-12-19T11:01:24Z @tobiu assigned to @tobiu
- 2025-12-19T12:42:27Z @tobiu referenced in commit `9cbe10e` - "SortZone: Animate dashboard items to fill space during window drag #8141"
### @tobiu - 2025-12-19T12:44:04Z

**Input from Gemini:**

> ✦ The implementation of this feature involved several key refinements to the initial strategy to ensure a robust and high-quality UX.
> 
> **1. Full-Geometry Animation Strategy:**
> Instead of simply clearing styles, we implemented a system that calculates a specific "Target Layout" for the remaining dashboard items when a component is dragged out. This allows us to use CSS transitions on `width`, `height`, `left`, and `top` for a smooth "fill space" animation.
> 
> **2. Robust Layout Calculation:**
> We implemented `calculateExpandedLayout` which:
> *   **Infers Gaps & Padding:** Instead of parsing CSS, it analyzes the cached `itemRects` snapshot to mathematically derive the container's start/end offsets (padding) and the inter-item gaps. This ensures the "Expanded" layout perfectly respects the original design tokens (e.g., the 20px gaps in the AgentOS dashboard) without hardcoding them.
> *   **Flex-Aware Distribution:** It distributes the available space (total size minus offsets and gaps) proportionally based on the items' `flex` configs.
> 
> **3. State Management & Restoration:**
> *   **Window Drag Start:** We hide the placeholder and apply the calculated "Expanded" styles to the siblings.
> *   **Re-entry (Drag Move):** When dragging back into the zone, we restore the *original* layout snapshot (position and size) from `itemRects` and show the placeholder. This creates a seamless "snap back" effect.
> *   **Cleanup (Drag End):** We refactored `onDragEnd` to safely handle the complex state transitions (window vs. in-app), ensuring the drag proxy is removed and the component is either moved back (if dropped in-app) or left alone (if dropped in window), while correctly cleaning up the placeholder.
> 
> **4. CSS Updates:**
> *   Updated `SortZone.scss` to include `width` and `height` in the `transition-property`, enabling the smooth resizing effects.
> 
> This approach delivers a premium feel where the dashboard intelligently reflows to fill the void left by a detached window, and gracefully restores itself when the window returns.

- 2025-12-19T12:46:00Z @tobiu closed this issue
- 2025-12-19T12:51:38Z @tobiu cross-referenced by #8142

