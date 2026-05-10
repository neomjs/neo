---
id: 9445
title: 'TreeGrid Documentation: Create high-level architectural guide for TreeStore'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-12T09:15:09Z'
updatedAt: '2026-03-12T09:48:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9445'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T09:16:43Z'
---
# TreeGrid Documentation: Create high-level architectural guide for TreeStore

### Goal
Create a comprehensive, high-level architectural guide for the new `Neo.data.TreeStore` to be included in the Portal App's learning section under "Data Handling".

### Details
The guide needs to explain the complex, multi-threaded architecture of the Neo.mjs TreeGrid in a way that is accessible but deeply technical, satisfying the curiosity of senior architects and clearly contrasting our approach with industry leaders like AG Grid or Bryntum.

Key concepts to cover:
1.  **The "Heavy OOP" Trap:** Explain why traditional ORM models (instantiating heavy `Model` classes for every node) fail at scale and cause Garbage Collection pauses.
2.  **The RecordFactory Advantage:** Detail how Neo.mjs uses a single Model instance and dynamically generates lightweight `Record` prototypes, encapsulating raw JSON behind a Symbol for zero-overhead property access.
3.  **The Dual-Layer Architecture:**
    *   **Structural Layer:** Deep, hierarchical maps (`#childrenMap`, `#allRecordsMap`) for O(1) data access.
    *   **Projection Layer:** The flat `_items` array that UI virtual scrollers actually bind to.
4.  **WAI-ARIA Trade-offs:** Explain why maintaining `siblingCount` and `siblingIndex` directly on the record (paying an O(N) cost during mutation) is critical for guaranteeing O(1) read performance during 60-120fps scrolling.
5.  **Reactivity Models:** Contrast single-node `toggle` operations (firing `mutate` events) with highly optimized bulk operations like `expandAll` (silent state updates followed by a single `load` event).
6.  **Mermaid Diagrams:** Include sequence diagrams to visually explain the projection splicing and the difference between single and bulk operations. Ensure diagrams use structural styling (`stroke-width`, `stroke-dasharray`) rather than hardcoded background colors to support the Portal App's dark mode.

## Timeline

- 2026-03-12T09:15:11Z @tobiu added the `documentation` label
- 2026-03-12T09:15:11Z @tobiu added the `enhancement` label
- 2026-03-12T09:15:11Z @tobiu added the `ai` label
- 2026-03-12T09:15:11Z @tobiu added the `grid` label
- 2026-03-12T09:15:56Z @tobiu referenced in commit `b9a909f` - "docs: Add high-level architectural guide for TreeStore (#9445)"
### @tobiu - 2026-03-12T09:16:12Z

**Input from Gemini 3.1 Pro:**

> ✦ I have drafted and committed the new `TreeStore` architectural guide.
> 
> The guide successfully covers:
> 1. The memory and GC pitfalls of traditional ORM grids (Bryntum/ExtJS).
> 2. Neo's "Zero-Overhead" `RecordFactory` and single Model instance architecture.
> 3. The Structural vs Projection layer maps.
> 4. The explicit O(N) write vs O(1) read trade-off required for performant WAI-ARIA support.
> 5. Optimized bulk operations (`expandAll`/`collapseAll`) and their distinction from single `toggle` operations.
> 6. Mermaid sequence diagrams (styled for dark mode compatibility) illustrating the rendering flow.
> 
> The guide is now integrated into the Portal App's learning section (`learn/tree.json`). I have pushed the commit to the `dev` branch.

- 2026-03-12T09:16:22Z @tobiu assigned to @tobiu
- 2026-03-12T09:16:30Z @tobiu added parent issue #9404
- 2026-03-12T09:16:43Z @tobiu closed this issue
- 2026-03-12T09:23:13Z @tobiu referenced in commit `79273d9` - "docs: Fix mermaid rendering issue with '#' character in loop description (#9445)"
### @tobiu - 2026-03-12T09:48:23Z

Fixed mermaid rendering issue with '#' character in loop description.


