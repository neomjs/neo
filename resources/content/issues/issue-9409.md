---
id: 9409
title: CSS Animations for TreeGrid Expand/Collapse
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-09T11:01:21Z'
updatedAt: '2026-03-12T14:12:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9409'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# CSS Animations for TreeGrid Expand/Collapse

### Goal
Provide smooth, CSS-based visual transitions when expanding or collapsing nodes in a Tree Grid, enhancing the user experience.

### Details
1.  **Animation Strategy (Row Pooling):**
    - Because `GridBody` uses row pooling and absolute positioning (`transform: translate3d`), we cannot rely on simple `height: 0` to `height: 100%` transitions on the container.
    - Instead, we should implement a staggered fade-in (`opacity`) or slight vertical slide (`translateY`) for newly rendered rows that enter the visible array during an `expand` operation.
    - During a `collapse`, rows might quickly fade out before the view collapses.
2.  **CSS Implementation:**
    - Introduce new CSS classes (e.g., `.neo-tree-row-entering`, `.neo-tree-row-leaving`).
    - Define keyframes or transitions in `resources/scss/src/grid/Row.scss`.
3.  **Lifecycle Hook:**
    - The `GridBody` (or `Row`) needs to conditionally apply these classes based on the `TreeStore`'s recent mutation events.
    - A config like `animateTreeNodes: true` (defaulting to `false` for maximum performance) should govern this behavior.

## Timeline

- 2026-03-09T11:01:21Z @tobiu added the `enhancement` label
- 2026-03-09T11:01:22Z @tobiu added the `design` label
- 2026-03-09T11:01:22Z @tobiu added the `ai` label
- 2026-03-09T11:01:22Z @tobiu added the `grid` label
- 2026-03-09T11:01:33Z @tobiu added parent issue #9404
- 2026-03-09T11:11:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-12T14:03:46Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Strategy Analysis & Pivot: Why simple CSS transitions fail in Virtual Row Pooling
> 
> We attempted to implement CSS animations for TreeGrid expand/collapse by applying `.neo-tree-row-entering` and `.neo-tree-row-leaving` classes during the `mutate` event of the `TreeStore`, combined with CSS `transition: opacity, transform`.
> 
> **The Failure Mode:**
> The UX was broken. The root cause is the architectural conflict between **CSS Transitions** (which require stable DOM node identities) and **Virtual Row Pooling** (which intentionally recycles DOM nodes).
> 
> 1.  **No Fade-In:** When expanding a folder, the new rows are actually recycled DOM nodes pulled from the bottom of the virtual pool. When they are placed into their new position and given the `entering` class (opacity: 0, translateY: -32px), they don't fade in smoothly from their new slot. Because they are the *same physical DOM node* that was just at the bottom of the grid, the browser attempts to animate them "flying up" across the entire screen from `translateY(1500px)` to `translateY(150px)`.
> 2.  **No Fade-Out:** When collapsing a folder, the rows are instantly spliced out of the `TreeStore` projection layer and recycled for other records. They simply vanish; there is no DOM node left in that visual position to apply a `fade-out` transition to.
> 3.  **Global Transition Chaos:** If we apply `transition: transform` globally to grid rows, normal virtual scrolling breaks completely, as every recycled row animates to its new position as you scroll.
> 
> **The "Delayed Permutation" Strategy (The only viable path):**
> 
> To animate a virtualized TreeGrid, we must separate the *visual transition* from the *data mutation*.
> 
> 1.  **`beforeMutate` Event:** `TreeStore` must fire an event *before* `splice` is called, detailing the intended changes (e.g., "Row 5 is expanding, creating 3 new rows").
> 2.  **Visual Pre-emption (The Gap):** `GridBody` listens to this event. It applies a temporary `transform: translateY(3 * rowHeight)` to all rows currently rendered below index 5. It turns on CSS transitions *only* for these specific rows.
> 3.  **The Wait:** The grid visually opens a gap over 300ms. Crucially, the `TreeStore` data and the Virtual Scroller's internal math remain completely untouched and stable during this time.
> 4.  **The Commit:** After 300ms, the actual `TreeStore.splice` occurs. The new items are injected. `GridBody` removes the temporary transforms. The new rows drop into the pre-made gap (where they can safely be given a fast `opacity: 0 -> 1` fade-in).
> 
> **Challenges of this Strategy:**
> *   **Concurrency:** If a user scrolls *during* the 300ms delay, the virtual scroller will recycle rows based on the old data, but some of those rows have temporary inline CSS transforms applied. We would need to temporarily lock scrolling (`overflow: hidden`) during tree animations.
> *   **Rapid Clicks:** If a user clicks expand/collapse rapidly on multiple folders, the `TreeStore` must queue these delayed permutations safely.
> 
> **Conclusion:**
> Adding animations to the TreeGrid requires a massive architectural shift in how `TreeStore` mutates and how `GridBody` intercepts those mutations before they affect the Virtual Scroller. Given the complexity (state management during delays, scrolling conflicts, rapid clicks), we are reverting the initial attempt.
> 
> This feature requires a dedicated, fresh session focused entirely on the "Delayed Permutation" architecture.

### @tobiu - 2026-03-12T14:12:10Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Architectural Blueprint: "Delayed Permutation" & Plugin Strategy
> 
> Based on further analysis, implementing the "Delayed Permutation" strategy requires a clean **hybrid architecture** splitting responsibilities between the core Data layer and an opt-in View plugin.
> 
> #### 1. Core Data Layer (`Neo.data.TreeStore`)
> The core store must gain the ability to temporarily suspend its structural mutations, allowing the UI to react to the *intent* of a change before the data actually shifts.
> 
> *   **New Config:** `deferMutations: Boolean` (default: `false`).
> *   **New Lifecycle Event:** `beforeMutate`. Fired when `expand()` or `collapse()` is called, containing the intended delta (e.g., `{ action: 'expand', record, addedCount: 3 }`).
> *   **New API:** `commitMutations()`. Executes the queued `splice` operation and fires the standard `mutate` event.
> 
> *Why Core?* We cannot safely "monkey-patch" or intercept asynchronous data operations from a plugin without creating fragile code. The data layer must natively support pausing.
> 
> #### 2. View Layer Plugin (`Neo.grid.plugin.AnimateTreeNodes`)
> We should **not** add animation logic to `GridBody.mjs` or `Row.mjs`. It violates the Single Responsibility Principle and bloats the core renderer for a niche feature.
> 
> *   **Activation:** When attached, it sets `grid.store.deferMutations = true`.
> *   **Orchestration:** Listens to the `beforeMutate` event.
> *   **Visual Pre-emption:** Analyzes the `GridBody` VDOM. Calculates which existing rows need to slide to create/close gaps. Applies temporary inline `transform` overrides and `.neo-is-animating` CSS classes directly to those VDOM nodes.
> *   **The Bridge:** Sets a timeout matching the CSS transition. Once complete, it calls `store.commitMutations()`, allowing the grid to perform a standard, instantaneous data update into the pre-animated gaps.
> 
> #### 3. Addressing the Broken `AnimateRows` Plugin
> The existing `Neo.grid.plugin.AnimateRows` is currently broken under the Row Pooling architecture because it assumes stable DOM node identities, which pooling destroys.
> 
> **Recommendation:** We should **combine** the goals of `AnimateRows` and `AnimateTreeNodes` into a single, comprehensive `Neo.grid.plugin.Animate` (or rewrite `AnimateRows` entirely).
> *   The fundamental problem (animating pooled rows) is identical for both sorting/filtering and tree expansion.
> *   A unified plugin can use the "Delayed Permutation" (or Snapshot & Overlay) techniques to handle all grid animations: row insertion, deletion, sorting, and tree toggling.
> *   Fixing the old plugin in isolation is wasted effort if the new TreeGrid animation strategy requires fundamentally different mechanics.
> 
> This approach keeps the core framework highly performant while cleanly encapsulating complex, stateful animations.


