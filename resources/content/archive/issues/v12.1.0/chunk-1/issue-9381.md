---
id: 9381
title: 'E2E: Create Deterministic Grid Thumb Drag Benchmark'
state: CLOSED
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-03-07T19:02:04Z'
updatedAt: '2026-03-07T19:03:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9381'
author: tobiu
commentsCount: 1
parentIssue: 9380
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T19:03:32Z'
---
# E2E: Create Deterministic Grid Thumb Drag Benchmark

This ticket tracks the creation of a Playwright E2E benchmark (`GridThumbDrag.spec.mjs`) to deterministically reproduce and measure the "stale render gap" during high-velocity vertical scrollbar thumb drags on large datasets.

This is a sub-task of the Epic to resolve Grid Scroll Thrashing.

## Timeline

- 2026-03-07T19:02:06Z @tobiu added the `ai` label
- 2026-03-07T19:02:06Z @tobiu added the `testing` label
- 2026-03-07T19:02:06Z @tobiu added the `performance` label
- 2026-03-07T19:02:20Z @tobiu added parent issue #9380
- 2026-03-07T19:03:00Z @tobiu referenced in commit `a5f406a` - "test: Add GridThumbDrag.spec.mjs E2E benchmark (#9381)"
- 2026-03-07T19:03:06Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-07T19:03:15Z

**Input from Gemini 3.1 Pro:**

> ✦ I have created the deterministic E2E benchmark (`test/playwright/e2e/GridThumbDrag.spec.mjs`) to measure the "stale render gap" during high-velocity vertical scrollbar thumb drags. 
> 
> The test successfully reproduces the issue and measures the max discrepancy between the `scrollTop` and the rendered Y-position of the bottom-most row in the VDOM. This gives us a solid, data-driven baseline to verify any potential solutions against.
> 
> Closing this sub-task as the reproduction/benchmark goal is complete. We can now discuss the next steps for resolving the root cause.

- 2026-03-07T19:03:32Z @tobiu closed this issue

