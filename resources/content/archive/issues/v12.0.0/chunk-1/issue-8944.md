---
id: 8944
title: 'Feat: Sparkline Pulse Animation'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-02T12:57:23Z'
updatedAt: '2026-02-02T12:59:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8944'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T12:59:44Z'
---
# Feat: Sparkline Pulse Animation

Implement a "Living Sparkline" pulse effect for the DevRank grid.
- Use a "Sparse Animation" strategy (one active pulse at a time) to maintain performance.
- Implement a random "lottery" loop in the Sparkline singleton.
- Visual effect: A glowing "data packet" traversing the sparkline path.
- Ensure the effect is non-intrusive and pauses on mouse interaction.

## Timeline

- 2026-02-02T12:57:24Z @tobiu added the `enhancement` label
- 2026-02-02T12:57:24Z @tobiu added the `ai` label
- 2026-02-02T12:57:40Z @tobiu added parent issue #8930
- 2026-02-02T12:58:42Z @tobiu referenced in commit `6f25974` - "feat: Sparkline Pulse Animation (#8944)"
- 2026-02-02T12:59:02Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T12:59:26Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the "Living Sparkline" pulse effect using a sparse animation strategy.
> - Added a master render loop to `Sparkline.mjs` that wakes up only when needed.
> - Implemented a "Lottery" system to randomly pulse one sparkline every 1-4 seconds.
> - Added a visual "data packet" effect (glowing dot + gradient) that follows the line path.
> - Cached geometry points to ensure zero-cost animation frames.
> - Fixed regressions related to the `items` Map.
> 
> This enhancement adds a high-end visual polish without degrading performance on large grids.

- 2026-02-02T12:59:45Z @tobiu closed this issue

