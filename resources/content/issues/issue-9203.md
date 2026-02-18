---
id: 9203
title: Investigate Grid Scrolling Performance via Column Ablation Strategy
state: OPEN
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-18T12:07:49Z'
updatedAt: '2026-02-18T12:11:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9203'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate Grid Scrolling Performance via Column Ablation Strategy

Recent benchmarks (#9199) identified a significant performance bottleneck in the Grid component on Desktop viewports (1920x1080).
- **Mobile (375x667):** 60 FPS
- **Laptop (1366x768):** 54 FPS
- **Desktop (1920x1080):** 30 FPS

The sharp drop to 30 FPS on Desktop, despite only a ~12% increase in active cells compared to Laptop, suggests a **non-linear scaling issue** or a specific CSS/Layout trigger that is disproportionately expensive at this scale.

Since general optimizations (throttling, buffer reduction) failed to improve the Desktop framerate, we need to isolate the specific rendering cost.

**Strategy: Column Ablation**
We need to systematically remove specific column types from the `DevIndex` grid and re-run the benchmark to identify if a particular component style is the culprit.

**Tasks:**
1.  **Modify Benchmark:** Update `test/playwright/e2e/GridScrollBenchmark.spec.mjs` to support an `excludeColumn` parameter (or create variants).
2.  **Test Iterations:** Run the benchmark on Desktop (1920x1080) for each scenario:
    -   **Baseline:** All columns active (Control).
    -   **No Images:** Exclude `GitHubOrgs`, `CountryFlag`, and `IconLink` (Avatar/Flag/Icon images).
    -   **No Sparklines:** Already tested (30 -> 33 FPS, minor impact), but worth re-verifying in this suite.
    -   **No Custom Components:** Exclude `Heuristics`.
    -   **Text Only:** Hide all Year/Number columns (reduce text node count).
3.  **Analyze:** Compare the FPS and Main Thread Trace activity.
    -   If removing `CountryFlag` jumps FPS to 50+, investigate its shadow/border/SVG styles.
    -   If removing `GitHubOrgs` jumps FPS, investigate `border-radius` or image decoding costs.
    -   If "Text Only" is still slow, the issue is the raw layout cost of the CSS Grid/Flexbox structure itself.

**Outcome:** Identify the specific CSS/DOM feature causing the 30 FPS cap on large screens.

## Timeline

- 2026-02-18T12:07:50Z @tobiu added the `ai` label
- 2026-02-18T12:07:50Z @tobiu added the `testing` label
- 2026-02-18T12:07:51Z @tobiu added the `performance` label
- 2026-02-18T12:08:17Z @tobiu assigned to @tobiu
- 2026-02-18T12:08:35Z @tobiu added parent issue #9194
### @tobiu - 2026-02-18T12:11:34Z

**Input from Gemini 3 Pro:**

> ✦ **Additional Hypothesis:**
> The Desktop bottleneck might be caused by the **Heatmap Text Shadows** (`text-shadow` in `resources/scss/src/apps/devindex/home/GridContainer.scss`).
> 
> ```scss
> &.heatmap-cell-3 {
>     text-shadow: var(--heatmap-shadow-3);
> }
> ```
> 
> On smaller viewports (Mobile/Laptop), these year columns might be hidden or fewer are visible. On Desktop (1920px), all ~15 year columns are visible.
> Rendering 15 columns x 29 rows = **435 text shadows** per frame could be the compositing killer.
> 
> **Investigation:**
> Add a test case to the Column Ablation suite to specifically disable `text-shadow` on heatmap cells.


