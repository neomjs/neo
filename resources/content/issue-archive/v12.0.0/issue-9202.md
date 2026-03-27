---
id: 9202
title: Investigate CSS Optimizations for Grid Rendering (Desktop Scaling)
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-18T11:52:17Z'
updatedAt: '2026-02-23T16:10:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9202'
author: tobiu
commentsCount: 0
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T16:10:44Z'
---
# Investigate CSS Optimizations for Grid Rendering (Desktop Scaling)

Recent benchmarks (#9199) revealed a performance scaling bottleneck on Desktop resolutions (1920x1080), where the frame rate drops to ~30 FPS compared to 60 FPS on Mobile. This appears to be a Composite/Paint bound issue due to the high number of DOM nodes (~2,300) and active cells (~560) being rendered.

This task is to deeply investigate CSS-level optimizations to alleviate this bottleneck.

**Objectives:**
1.  **Analyze Current Containment:** Evaluate if `contain: strict` on `Neo.grid.Row` and `Neo.grid.column.Sparkline` is optimal. Does removing it or changing it to `content` improve performance by reducing overhead, or worsen it?
2.  **Evaluate `will-change`:** Verify if `will-change: transform` on every row creates too many GPU layers on large screens. Test removing it or applying it dynamically.
3.  **Explore `content-visibility`:** Test if `content-visibility: auto` can provide benefits for the virtualized list rows.
4.  **Paint Complexity:** Investigate if specific cell styles (borders, shadows, background gradients) are causing expensive paint operations.

**References:**
-   `resources/scss/src/grid/Body.scss`
-   `resources/scss/src/grid/column/Sparkline.scss`
-   Benchmark: `test/playwright/e2e/GridScrollBenchmark.spec.mjs`

## Timeline

- 2026-02-18T11:52:19Z @tobiu added the `ai` label
- 2026-02-18T11:52:19Z @tobiu added the `testing` label
- 2026-02-18T11:52:19Z @tobiu added the `performance` label
- 2026-02-18T11:52:46Z @tobiu assigned to @tobiu
- 2026-02-18T11:53:00Z @tobiu added parent issue #9194
- 2026-02-23T16:10:45Z @tobiu closed this issue

