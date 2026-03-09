---
id: 9408
title: Grid Core Integration & TreeGrid Accessibility
state: OPEN
labels:
  - enhancement
  - ai
  - core
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T10:59:16Z'
updatedAt: '2026-03-09T11:10:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9408'
author: tobiu
commentsCount: 1
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Core Integration & TreeGrid Accessibility

### Goal
Ensure `GridContainer`, `GridBody`, and `Row` correctly handle the dynamic flat-array sizing provided by the `TreeStore` and implement full WAI-ARIA treegrid attributes for maximum accessibility.

### Details
1.  **Virtual Scroller Reaction:**
    - Verify that `GridBody` correctly responds to the `TreeStore`'s `mutate` events when nodes expand/collapse (the `count` changes).
    - Ensure `aria-rowcount` on the `GridBody` updates dynamically based on the current length of the flattened view.
    - Ensure the `VerticalScrollbar` recalculates its height based on the new `store.count`.

2.  **A11y (Row Level ARIA):**
    - Update `src/grid/Row.mjs` -> `createVdom()`.
    - Map `record.expanded` to `aria-expanded` (true/false). Omit entirely for leaf nodes.
    - Map `record.depth` to `aria-level` (1-based).
    - Map `record.siblingCount` to `aria-setsize`.
    - Map `record.siblingIndex` to `aria-posinset` (1-based).
    - *Note:* The virtual scroller will naturally provide gapless `aria-rowindex` values based on the flattened visible array.

3.  **Data Layer Support for A11y Attributes:**
    - The `TreeStore` (or `TreeModel`) must provide `depth`, `siblingCount`, and `siblingIndex` for all records.
    - Use Neo's "Soft Hydration" pattern to calculate these lazily when needed, or compute them once during `loadData` and store them directly on the raw data objects / records for O(1) retrieval during rapid scrolling.

4.  **Role Update:**
    - Add a config `isTreeGrid: false` to `GridContainer`.
    - When `true`, switch the container's ARIA role from `grid` to `treegrid`.

## Timeline

- 2026-03-09T10:59:17Z @tobiu added the `enhancement` label
- 2026-03-09T10:59:17Z @tobiu added the `ai` label
- 2026-03-09T10:59:18Z @tobiu added the `core` label
- 2026-03-09T10:59:18Z @tobiu added the `grid` label
- 2026-03-09T10:59:33Z @tobiu added parent issue #9404
### @tobiu - 2026-03-09T11:09:12Z

**Input from Gemini 3.1 Pro:**

> ✦ **Implementation Guidance for Agents:**
> 
> 1. **ARIA Mapping:** The new WAI-ARIA attributes (`aria-expanded`, `aria-level`, `aria-setsize`, `aria-posinset`) MUST be applied directly to the row container.
> 2. **Target File:** Implement this mapping inside `src/grid/Row.mjs` within the `createVdom()` method.
> 3. **Contiguous Indexing:** Do not attempt to calculate complex `aria-rowindex` logic. Because the `TreeStore` provides a flattened array of visible nodes, `rowIndex + 2` inside `Row.mjs` will naturally remain contiguous and gapless.
> 4. **Role:** Add an `isTreeGrid` boolean config to `src/grid/Container.mjs`. If true, the container's VDOM root should use `role: 'treegrid'` instead of `role: 'grid'`.

- 2026-03-09T11:10:57Z @tobiu assigned to @tobiu

