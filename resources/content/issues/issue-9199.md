---
id: 9199
title: Benchmark Grid Horizontal Scroll Performance
state: OPEN
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-17T14:33:41Z'
updatedAt: '2026-02-17T15:27:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9199'
author: tobiu
commentsCount: 0
parentIssue: 9194
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

