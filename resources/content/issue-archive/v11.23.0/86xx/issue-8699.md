---
id: 8699
title: Iterative Theme Enhancement for HeaderCanvas
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T05:58:28Z'
updatedAt: '2026-01-20T16:19:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8699'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T16:19:15Z'
---
# Iterative Theme Enhancement for HeaderCanvas

The 'Luminous Flux' visual theme in 'HeaderCanvas.mjs' is washed out on light backgrounds.

This ticket tracks the iterative enhancement of the canvas to support a proper light mode:

1.  **Infrastructure:** Refactor to use a 'theme' config and 'colors' map (parity with current visuals).
2.  **Visual Tuning:**
    *   Darken strands for better contrast on white.
    *   Strengthen the 3D Ribbon gradient effect.
    *   Refine Nebula/Particle visibility.

**Constraint:** Changes must be atomic and verifiable to avoid regressions.

## Timeline

- 2026-01-16T05:58:29Z @tobiu added the `enhancement` label
- 2026-01-16T05:58:29Z @tobiu added the `ai` label
- 2026-01-16T06:17:55Z @tobiu changed title from **Enhance HeaderCanvas with Theming and Responsive Scaling** to **Iterative Theme Enhancement for HeaderCanvas**
- 2026-01-16T06:31:16Z @tobiu referenced in commit `d983c93` - "refactor: Introduce theming infrastructure for HeaderCanvas (Step 1) (#8699)"
- 2026-01-16T06:47:24Z @tobiu assigned to @tobiu
- 2026-01-20T16:19:15Z @tobiu closed this issue

