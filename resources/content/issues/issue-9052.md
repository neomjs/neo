---
id: 9052
title: 'Perf: Optimize Sparkline Backpressure & Investigate Grid Reflows'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-08T17:58:26Z'
updatedAt: '2026-02-08T18:11:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9052'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T18:11:20Z'
---
# Perf: Optimize Sparkline Backpressure & Investigate Grid Reflows

The DevRank Grid shows "Forced Reflow" and "RequestAnimationFrame" violations during rapid scrolling (e.g., Page Down / End).
Initial hypothesis (Canvas Worker overload) led to the implementation of Adaptive Backpressure in `Neo.canvas.Sparkline`.
However, tests reveal that violations persist even when Sparkline components are removed, pointing to a root cause in the Grid's Main Thread rendering or layout logic.

**Tasks:**
1.  Finalize Sparkline optimizations:
    *   Enable Adaptive Backpressure (Frame Budgeting).
    *   Apply `contain: strict` to wrappers.
    *   Set `maxConcurrentTransitions` to 30.
2.  Investigate `Neo.grid.Body` and `Neo.grid.Container` for sources of synchronous layout thrashing (forced reflows) during large scroll jumps.

## Timeline

- 2026-02-08T17:58:28Z @tobiu added the `bug` label
- 2026-02-08T17:58:28Z @tobiu added the `ai` label
- 2026-02-08T17:58:28Z @tobiu added the `performance` label
- 2026-02-08T18:00:01Z @tobiu referenced in commit `18a17c1` - "perf: Implement adaptive backpressure for Sparklines (#9052)"
- 2026-02-08T18:11:15Z @tobiu assigned to @tobiu
- 2026-02-08T18:11:20Z @tobiu closed this issue
- 2026-02-08T18:51:03Z @tobiu added parent issue #8930

