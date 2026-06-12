---
id: 9626
title: 'Epic: Grid Unified Scrolling & VDOM Orchestration'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
  - grid
assignees:
  - tobiu
createdAt: '2026-04-02T08:17:06Z'
updatedAt: '2026-04-02T22:52:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9626'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues:
  - '[x] 9627 Grid Multi-Body: Introduce `grid.View` and Flatten `grid.Body` DOM'
  - '[x] 9628 Grid Multi-Body: Map Physical Heights and Transfer Vertical Scrolling'
  - '[x] 9629 Grid Multi-Body: Implement Atomic VDOM Orchestration Layer'
  - '[x] 9630 Grid: Implement Main-Thread Addon Hover Synchronization'
  - '[x] 9631 Grid: Enable Horizontal Scrolling via Locked Regions'
  - '[x] 9632 Grid: Restore Row Scroll Pinning and Update Drag E2E Tests'
  - '[x] 9633 Grid: Rename bodyWrapper to view'
  - '[x] 9634 Grid Container: Remove redundent grid wrapper node'
subIssuesCompleted: 8
subIssuesTotal: 8
blockedBy: []
blocking: []
closedAt: '2026-04-02T22:52:34Z'
---
# Epic: Grid Unified Scrolling & VDOM Orchestration

This epic tracks the architectural pivot of the Grid Multi-Body structure to a unified vertical scrolling mechanism and centralized VDOM orchestration.

### The Problem
Currently, the Grid V2 splits the grid into three independent scrolling bodies (`bodyStart`, `body`, `bodyEnd`) that sync their offsets dynamically. However, since they update their VDOM payloads independently via their own calculation loops, the larger center body (with more unlocked columns) requires more time to calculate delta patches than the start/end bodies. This results in staggered, non-deterministic VDOM updates arriving on the main thread, leading to horizontal tearing and jitter during rapid scrolling.

### The Solution: `grid.View`
We are flattening the child `grid.Body` components to be strictly full-height data strips (no internal scrolling, no stretchers). We introduce a new overarching orchestrator class, `neo.grid.View` (acting as the unified `bodyWrapper`), which manages vertical scrolling natively.

This `grid.View` class will take over the `createViewData` calculation cycle. During a scroll event, the View calculates the new row index limits and instructs all internal bodies to update their view data silently (`silent: true`). Once all sub-grids are prepared, the View triggers a single, unified VDOM update (`this.update({updateDepth: -1})`), guaranteeing that the entire scroll state is painted atomically by the compositor thread.

## Timeline

- 2026-04-02T08:17:07Z @tobiu assigned to @tobiu
- 2026-04-02T08:17:08Z @tobiu added the `epic` label
- 2026-04-02T08:17:09Z @tobiu added the `ai` label
- 2026-04-02T08:17:09Z @tobiu added the `architecture` label
- 2026-04-02T08:17:09Z @tobiu added the `grid` label
- 2026-04-02T08:17:16Z @tobiu added parent issue #9486
- 2026-04-02T08:20:04Z @tobiu added sub-issue #9627
- 2026-04-02T08:20:05Z @tobiu added sub-issue #9628
- 2026-04-02T08:20:07Z @tobiu added sub-issue #9629
### @tobiu - 2026-04-02T08:41:32Z

All 3 architectural phases for unified vertical scrolling and atomic VDOM updates have been completed successfully. The Grid is fully transformed to top-down orchestration.

- 2026-04-02T08:41:34Z @tobiu closed this issue
- 2026-04-02T08:49:25Z @tobiu reopened this issue
- 2026-04-02T09:27:55Z @tobiu cross-referenced by #9630
- 2026-04-02T09:28:02Z @tobiu added sub-issue #9630
- 2026-04-02T10:11:49Z @tobiu cross-referenced by #9631
- 2026-04-02T10:12:00Z @tobiu cross-referenced by #9632
- 2026-04-02T10:12:05Z @tobiu added sub-issue #9631
- 2026-04-02T10:12:06Z @tobiu added sub-issue #9632
- 2026-04-02T13:06:48Z @tobiu cross-referenced by #9633
- 2026-04-02T13:06:57Z @tobiu added sub-issue #9633
- 2026-04-02T13:55:57Z @tobiu cross-referenced by #9634
- 2026-04-02T13:56:04Z @tobiu added sub-issue #9634
- 2026-04-02T22:52:34Z @tobiu closed this issue

