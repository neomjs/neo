---
id: 9199
title: Benchmark Grid Horizontal Scroll Performance
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-17T14:33:41Z'
updatedAt: '2026-02-18T11:47:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9199'
author: tobiu
commentsCount: 1
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-18T11:47:58Z'
---
# Benchmark Grid Horizontal Scroll Performance

### Objective
Investigate and verify the performance impact of "Virtual Fields" and "Dynamic Column Updates" on horizontal scrolling in the Grid.

### Motivation
Post-implementation of "Zero Overhead" records (#9193), there is a subjective perception that horizontal scrolling in `DevIndex` has become sluggish. We need objective data to confirm if this is a regression caused by the virtual getter overhead, the fix in `Column.mjs`, or an unrelated factor (e.g., dataset size).

### Tasks
1.  **Create Benchmark Test:** Develop a Playwright component test (`test/playwright/component/benchmark/GridScroll.spec.mjs`) that:
    *   Loads a Grid with the `DevIndex` column structure.
    *   Performs an automated horizontal scroll sequence.
    *   Measures Frame Rate (FPS) and/or Scripting Duration.
2.  **Profiling:** Use Chrome DevTools Performance Trace (via Playwright) to pinpoint if the bottleneck is:
    *   **Scripting:** `RecordFactory` getters, `Row.createVdom`.
    *   **Rendering:** Style/Layout calculations.
3.  **Analysis:** Compare metrics against a baseline (or theoretical expectations).

### Outcome
Definitive confirmation of performance status and identification of any bottlenecks to address.

## Timeline

- 2026-02-17T14:33:43Z @tobiu added the `ai` label
- 2026-02-17T14:33:43Z @tobiu added the `testing` label
- 2026-02-17T14:33:43Z @tobiu added the `performance` label
- 2026-02-17T14:33:53Z @tobiu added parent issue #9194
- 2026-02-17T15:27:38Z @tobiu assigned to @tobiu
- 2026-02-18T11:46:36Z @tobiu referenced in commit `9b94c52` - "feat: Add Playwright benchmark for Grid scrolling (#9199)"
### @tobiu - 2026-02-18T11:47:28Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the benchmark implementation and initial analysis.
> 
> ### Achievements
> 1.  **Infrastructure:** Created `test/playwright/e2e/` with necessary helpers and a custom system reporter.
> 2.  **Benchmark:** Implemented `GridScrollBenchmark.spec.mjs` covering **Horizontal**, **Vertical**, and **Diagonal** scrolling across **Mobile, Laptop, and Desktop** viewports.
> 3.  **Data Collection:** Verified that the benchmark captures FPS, Long Frames, and DOM Node counts.
> 
> ### Key Findings
> The benchmark revealed a critical **Scaling Bottleneck** on the Desktop (1920x1080) viewport.
> 
> | Viewport | Resolution | DOM Nodes | FPS | Status |
> | :--- | :--- | :--- | :--- | :--- |
> | **Mobile** | 375x667 | 1,731 | **60** | 🟢 |
> | **Laptop** | 1366x768 | 1,867 | **54** | 🟡 |
> | **Desktop** | 1920x1080 | **2,285** | **30** | 🔴 |
> 
> ### Experiments & Analysis
> I performed several experiments to isolate the cause of the Desktop performance drop:
> 1.  **Throttling:** Increasing update throttling (48ms, 160ms) had negligible impact (~33 FPS).
> 2.  **Buffer Reduction:** Reducing `mountedColumns` buffer helped slightly but didn't solve it.
> 3.  **Component Removal:** Removing the heavy Sparkline column (OffscreenCanvas) also had negligible impact.
> 
> **Conclusion:** The bottleneck is the **Composite/Paint cost** of the large DOM tree (2,000+ nodes) on the 1080p surface. The Main Thread is saturated by the browser's rendering engine, not by Scripting or Worker communication.
> 
> ### Future Work
> New tickets should be created to investigate:
> -   **CSS Containment:** Applying `contain: strict` to Rows/Cells.
> -   **Layer Promotion:** Optimizing `will-change`.
> -   **DOM Flattening:** Reducing the nesting depth of cells.

- 2026-02-18T11:47:58Z @tobiu closed this issue
- 2026-02-18T11:52:18Z @tobiu cross-referenced by #9202
- 2026-02-18T12:07:50Z @tobiu cross-referenced by #9203

