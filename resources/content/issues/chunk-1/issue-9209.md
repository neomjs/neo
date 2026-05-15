---
id: 9209
title: Benchmark Grid Scroll-to-Update Latency
state: OPEN
labels:
  - ai
  - testing
  - performance
  - grid
assignees:
  - tobiu
createdAt: '2026-02-19T10:58:28Z'
updatedAt: '2026-02-19T11:27:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9209'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Benchmark Grid Scroll-to-Update Latency

**Context:**
We have established that the Grid can render frames at >60 FPS. The next frontier in performance is **Latency**. In a buffered grid, the critical metric is not just FPS, but the time between a `scroll` event and the corresponding `cell content update`.

**Objective:**
Create a deep telemetry benchmark that measures the "Input-to-Pixel" latency of the Grid.

**Metrics to Capture:**
1.  **Scroll Latency:** Time from `scroll` event to `Neo.grid.Body#onScroll` execution.
2.  **Update Latency:** Time from `onScroll` to `createViewData` completion.
3.  **Render Latency:** Time from `createViewData` (VDOM diff) to actual DOM update (MutationObserver trigger on specific cell).
4.  **Worker Roundtrip:** Measure the App Worker -> VDom Worker -> Main Thread cycle time during a scroll.

**Implementation:**
-   Instrument `Neo.grid.Body` and `Neo.grid.View` with performance marks.
-   Use `performance.measure` to capture the deltas.
-   Expose these metrics to the Playwright harness via a global `Neo.telemetry` object.

## Timeline

- 2026-02-19T10:58:30Z @tobiu added the `ai` label
- 2026-02-19T10:58:30Z @tobiu added the `testing` label
- 2026-02-19T10:58:30Z @tobiu added the `performance` label
- 2026-02-19T10:58:30Z @tobiu added the `grid` label
### @tobiu - 2026-02-19T11:26:15Z

**Input from Gemini 3 Pro:**

> ✦ ### Strategic Expansion: A/B Testing Architecture (Pooling vs. RemoveDom)
> 
> This benchmark infrastructure (#9209) is the perfect vehicle to scientifically resolve the architectural debate between **DOM Pooling** (Current) and **RemoveDom** (Layout Thrashing).
> 
> **The Hypothesis:**
> -   **Pooling:** High DOM weight (~2000 nodes), zero insertion/removal costs. Optimizes for **CPU/Main Thread** stability by trading Memory.
> -   **RemoveDom:** Low DOM weight (<500 nodes), high frequency `appendChild`/`removeChild`. Optimizes for **Memory** by trading CPU (Layout/Recalculate Style & V8 Binding).
> 
> **The Nuance:**
> With modern `contain: strict` and column/row buffering, the "Layout Thrashing" cost of `removeDom` is significantly mitigated compared to legacy implementations. On high-end CPUs (Desktop), `removeDom` might actually outperform Pooling if Memory Bandwidth (traversing the larger DOM tree) is the bottleneck.
> 
> **Future Test Cases:**
> We should extend this benchmark to support a toggle (e.g., `Neo.config.grid.useDomPooling`) to A/B test these strategies on identical hardware. This will allow us to auto-tune the grid strategy based on the detected device capabilities (e.g., use Pooling on Mobile to save battery, use RemoveDom on Desktop to save RAM).

- 2026-02-19T11:27:29Z @tobiu assigned to @tobiu

