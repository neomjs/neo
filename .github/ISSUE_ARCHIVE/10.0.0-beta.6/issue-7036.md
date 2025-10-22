---
id: 7036
title: Update Framework Comparison Guides
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-13T09:06:37Z'
updatedAt: '2025-07-13T09:10:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7036'
author: tobiu
commentsCount: 0
parentIssue: 7029
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-13T09:10:37Z'
---
# Update Framework Comparison Guides

**Reported by:** @tobiu on 2025-07-13

---

**Parent Issue:** #7029 - Feature: Add Framework Comparison Articles to Learn Directory

---

## Summary

The framework comparison guides located in `learn/comparisons/` have been updated to reflect the latest advancements in the Neo.mjs functional component API and core reactivity system. The JSDoc for `defineComponent` was also updated to serve as a primary source of truth.

## Reason for Update

To ensure technical accuracy and to clearly articulate the significant advantages of Neo.mjs's architecture, particularly in contrast to established frameworks like React. The recent finalization of the `defineComponent` and `useConfig` APIs provided new insights that needed to be documented.

## Key Changes Applied

1.  **`NeoVsReact.md`:**
    *   Re-contextualized React as a legacy industry standard, not a "modern" framework.
    *   Clarified the "mutability for the developer, immutability for the process" VDOM strategy.
    *   Detailed the precision of `Effect`-based rendering vs. React's cascading re-render model, removing the need for manual memoization.
    *   Added a "Linear Effort for Complexity" section with a concrete example.

2.  **`NeoVsAngular.md`:**
    *   Updated to include the new dual (class-based and functional) component model.
    *   Contrasted Angular's Zone.js with the surgical precision of Neo.mjs's `Effect`-based reactivity.

3.  **`NeoVsSolid.md`:**
    *   Refined the comparison between Solid's "run-once" components and Neo.mjs's re-running `createVdom` effects.
    *   Clarified the architectural trade-offs (Solid's Main-Thread speed vs. Neo.mjs's guaranteed Main-Thread responsiveness).

4.  **`NeoVsExtJs.md`:**
    *   Updated to highlight the modern dual component model as a clear upgrade path.
    *   Sharpened the contrast between Ext.js's manual eventing and Neo.mjs's automatic, fine-grained reactivity.

5.  **`src/functional/defineComponent.mjs`:**
    *   The main JSDoc for the function was rewritten to clearly distinguish between:
        *   **Named configs (`static config`):** For the public component API (props).
        *   **`useConfig()`:** For private, encapsulated component state.

## Files Modified

- `/Users/Shared/github/neomjs/neo/learn/comparisons/NeoVsReact.md`
- `/Users/Shared/github/neomjs/neo/learn/comparisons/NeoVsAngular.md`
- `/Users/Shared/github/neomjs/neo/learn/comparisons/NeoVsSolid.md`
- `/Users/Shared/github/neomjs/neo/learn/comparisons/NeoVsExtJs.md`
- `/Users/Shared/github/neomjs/neo/src/functional/defineComponent.mjs`

