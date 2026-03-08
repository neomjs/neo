---
id: 9401
title: 'Performance: Proxy Getter Hoisting in Grid Row & Array Slice Optimization'
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-03-08T21:40:34Z'
updatedAt: '2026-03-08T21:59:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9401'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-08T21:59:40Z'
---
# Performance: Proxy Getter Hoisting in Grid Row & Array Slice Optimization

**Problem:**
Profiling the App Worker during fast grid scrolling reveals that the reactive Config getters (`Neo.mjs:348` and `Base.mjs:971`) consume a massive `17.4%` of total self-time.

A significant portion of this overhead comes from `src/grid/Row.mjs`. 
During `createVdom`, the Row iterates over every column cell and calls `applyRendererOutput`. Inside `applyRendererOutput`, it queries `me.parent`, `me.parent.parent`, `gridBody.store`, `gridBody.selectedCells`, and `gridBody.colspanField`.

Because these are reactive array/object configs, querying them inside a 1,500-iteration hot loop triggers thousands of proxy intercepts and forces the framework to shallow-clone arrays (`selectedCells`) thousands of times per frame.

Furthermore, the default array cloning mechanism in `Neo.mjs` uses `[...value]`, which is inherently slower than the native `value.slice()`.

**Proposed Solution:**
1. **Getter Hoisting:** Inside `Row.mjs:createVdom`, destructure all needed `gridBody` and `gridContainer` properties exactly once. Pass these stable references down into `applyRendererOutput` to completely bypass the getter proxy in the hot loop.
2. **V8 Optimization:** In `Neo.mjs` config getter trap, replace the legacy array clone logic `value = [...value]` with `value = value.slice()` for faster native array copies.

## Timeline

- 2026-03-08T21:40:35Z @tobiu added the `enhancement` label
- 2026-03-08T21:40:35Z @tobiu added the `ai` label
- 2026-03-08T21:40:35Z @tobiu added the `performance` label
- 2026-03-08T21:58:38Z @tobiu referenced in commit `7fb9286` - "perf: Proxy Getter Hoisting in Grid Row & Array Slice Optimization (#9401)"
- 2026-03-08T21:59:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-08T21:59:17Z

**Input from Gemini 3.1 Pro:**

> ✦ **Task Completed:**
> 
> - **Array Slice Optimization:** Replaced the legacy `[...value]` spread operator with the native V8 fast-path `value.slice()` inside the `Neo.mjs` reactive config getter interceptor. This speeds up all framework array clones (e.g. `items`, `columns`, `selectedRows`).
> - **Proxy Getter Hoisting:** Refactored `src/grid/Row.mjs:createVdom()` to destructure all needed `gridBody` and `gridContainer` reactive configs *once* before the column loops.
> - **Param Passing:** Updated `applyRendererOutput()` to accept a `cache` object containing these hoisted values, completely bypassing thousands of proxy intercepts and shallow array clones that were previously triggered on every single cell render during grid scrolling.

- 2026-03-08T21:59:41Z @tobiu closed this issue

