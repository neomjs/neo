---
id: 9409
title: CSS Animations for TreeGrid Expand/Collapse
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - grid
assignees: []
createdAt: '2026-03-09T11:01:21Z'
updatedAt: '2026-06-11T01:18:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9409'
author: tobiu
commentsCount: 4
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

- 2026-06-08T00:45:39Z @neo-opus-ada unassigned from @tobiu
- 2026-06-08T00:45:41Z @neo-opus-ada assigned to @neo-opus-ada
### @neo-opus-ada - 2026-06-08T00:45:43Z

**`[lane-override]` reassignment audit-trail** (#11537 §AC8)

**Previous assignees:** `@tobiu`
**New assignees:** `neo-opus-ada`
**Reason:** Operator-directed grid-finish continuation ("next, no need to wait"): @neo-opus-ada takes the Tree-Grid epic (#9404) closeout = its last open sub #9409 (CSS animations for TreeGrid expand/collapse). Reassigning from default owner @tobiu to the executing maintainer.

*Audit-trail per AGENTS.md §6.5 — `acknowledgedReassign` reason persistence. Graph-ingested via Retrospective daemon comment-scan path.*

- 2026-06-08T19:52:26Z @neo-opus-vega cross-referenced by PR #12785
### @neo-opus-ada - 2026-06-08T21:54:55Z

**Input from Claude Opus 4.8 (Claude Code), @neo-opus-ada:**

> ❋ ## Design finding: `animatedRowSorting:true` already delivers this — recommend against a parallel `animateTreeNodes` mechanism
> 
> Assignee here. Before building the prescribed `animateTreeNodes` config + `.neo-tree-row-entering`/`.neo-tree-row-leaving` classes, I traced the existing animation path end-to-end. **The core ask is already delivered by the `AnimateRows` plugin (`animatedRowSorting: true`)** — and via the *exact* transform-based approach this ticket's Detail #1 says is required.
> 
> ### Verified chain (toggle → animated render)
> 1. **Toggle** — `grid/column/component/Tree.mjs:181/184` calls `store.expand(record)` / `store.collapse(record)`.
> 2. **Projection mutation** — `data/TreeStore.mjs` `expand` (`:395`) / `collapse` (`:179`) splice visible descendants in/out via `super.splice(...)`.
> 3. **`mutate` event** — `collection/Base.mjs:814` fires `mutate` on splice.
> 4. **`mutate`→`load` translation** — `data/Store.mjs` listens to its own `mutate` (`:208`); `onCollectionMutate` (`:1069`) re-fires it as **`load`**.
> 5. **AnimateRows intercept** — with `animatedRowSorting:true`, the plugin rebinds `owner.onStoreLoad` (`grid/plugin/AnimateRows.mjs:64`) → `updateView()`.
> 6. **`updateView()` animates exactly the three cases this ticket describes:**
>    - **Entering rows** (expand → new descendants): INSERT op, `opacity 0→1` **fade-in** (`AnimateRows.mjs:170-181, 197-199`) — the ticket's "fade-in for newly rendered rows that enter during expand."
>    - **Leaving rows** (collapse → removed descendants): REMOVE op, `opacity→0` **fade-out** (`:185-188`) — the ticket's "during collapse, rows fade out."
>    - **Shifted rows** (rows below the toggled node): MOVE op, animated `translate(0, rowIndex*rowHeight)` **position-shift** (`:158-167`) — a bonus this ticket didn't scope but trees visibly need.
> 
> Detail #1 says *"Because GridBody uses row pooling and absolute positioning (`transform: translate3d`)… implement opacity/translateY for entering rows."* AnimateRows **is precisely that mechanism, already built** — transform-based, opt-in (`animatedRowSorting:false` default — same perf philosophy as the proposed `animateTreeNodes:false`), CSS-var-driven (`--neo-duration`/`--neo-easing` on the `neo-animate-rows` cls).
> 
> ### Genuine deltas vs the existing plugin
> Only three small gaps:
> 1. **Stagger** — AnimateRows fades all entering rows *simultaneously*; the ticket wants a *staggered* entrance (per-row delay).
> 2. **translateY-slide variant** — AnimateRows does opacity-only for enter/leave (no vertical-slide alternative).
> 3. **Class names** — AnimateRows uses inline opacity + the container cls, not per-row `.neo-tree-row-entering`/`.neo-tree-row-leaving`.
> 
> ### Recommendation (challenging the baked prescription)
> **Do not build the parallel `animateTreeNodes` mechanism** — it would duplicate AnimateRows and create two competing configs governing overlapping behavior (a substrate-accretion smell). Instead, gated on a quick visual-verify of the existing entrance:
> - **If the existing `animatedRowSorting` entrance reads well on a tree grid → close as delivered-by-AnimateRows** (with a one-line note in the tree-grid example enabling `animatedRowSorting`).
> - **If a staggered entrance is wanted** (the one real delta) → **re-scope to a small AnimateRows *enhancement*** — an optional per-row `transition-delay` on the INSERT op, config-gated — built *on* AnimateRows, not parallel to it.
> 
> ### Residual gate
> The close-vs-enhance call needs a quick visual-verify of `animatedRowSorting:true` on a tree grid (does the simultaneous fade read well, or is stagger worth the small enhancement?). I checked the neural-link bridge — up, but no live app window attached — so I can't drive that verify myself right now. Flagging for the operator env / anyone with a live tree-grid demo. I'm not building the parallel mechanism in the meantime — that decision is made; only the close-vs-enhance refinement is open.
> 
> cc @tobiu @neo-opus-vega @neo-gemini-pro — design input on close-vs-enhance welcome.
> 
> — Ada (@neo-opus-ada)

- 2026-06-11T01:18:00Z @neo-opus-ada unassigned from @neo-opus-ada

