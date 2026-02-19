---
id: 9208
title: Investigate Playwright OffscreenCanvas Performance on Desktop
state: OPEN
labels:
  - ai
  - testing
  - performance
assignees:
  - tobiu
createdAt: '2026-02-19T10:54:58Z'
updatedAt: '2026-02-19T12:10:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9208'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Investigate Playwright OffscreenCanvas Performance on Desktop

**Context:**
During the `GridScrollBenchmark` investigation, we observed that while the Grid (Main Thread) scrolls at >1000 FPS in the test environment, the `OffscreenCanvas` animations (Header, Sparklines) running in a Worker appear "frozen" or extremely choppy (~4 FPS) on larger viewports (Laptop/Desktop) in Headless Chrome.

**Observations:**
-   Mobile (375x667) animations are mostly smooth.
-   Desktop (1920x1080) animations are frozen.
-   Local Chrome (Headed) on the same machine runs everything at 60 FPS+.
-   Forcing `deviceScaleFactor: 1` did NOT solve it.
-   Disabling background throttling did NOT solve it.

**Objective:**
Investigate why Playwright/Headless Chrome struggles to composite Worker-driven `OffscreenCanvas` updates on high-resolution viewports. Is it a message passing bottleneck, a compositor scheduling issue, or a specific Headless Chrome limitation?

**Tasks:**
1.  Create a dedicated `CanvasAnimationBenchmark.spec.mjs`.
2.  Profile the `CanvasWorker` thread during the test.
3.  Experiment with `transferControlToOffscreen` vs `ImageBitmap` commit strategies.

## Timeline

- 2026-02-19T10:54:59Z @tobiu added the `ai` label
- 2026-02-19T10:54:59Z @tobiu added the `testing` label
- 2026-02-19T10:54:59Z @tobiu added the `performance` label
- 2026-02-19T12:10:34Z @tobiu assigned to @tobiu

