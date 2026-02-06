---
id: 9012
title: Optimize Grid Row Pooling to eliminate moveNode deltas
state: OPEN
labels:
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-06T02:20:37Z'
updatedAt: '2026-02-06T02:20:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9012'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Optimize Grid Row Pooling to eliminate moveNode deltas

Currently, `Neo.grid.Body` recycles rows by reordering them in the `vdom.cn` array to match the logical record order. This triggers extensive `moveNode` DOM operations during scrolling, which is performance-heavy.

The Goal: Implement a **Fixed-DOM-Order** strategy for Rows, similar to the Cell pooling strategy.
1.  Keep Row component references in a stable order in `Body.vdom.cn`.
2.  Use CSS transforms (already in place) to position rows visually.
3.  When scrolling, simply update the `transform` and content of the row that "wraps around", without changing its index in the `vdom.cn` array.

This will reduce scroll deltas to pure attribute updates (transform + content), eliminating layout thrashing caused by node movement.

## Timeline

- 2026-02-06T02:20:38Z @tobiu added the `performance` label
- 2026-02-06T02:20:38Z @tobiu added the `core` label
- 2026-02-06T02:20:58Z @tobiu assigned to @tobiu

