---
id: 8693
title: 'Docs: Clarify requestAnimationFrame usage in Canvas guides'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T22:06:15Z'
updatedAt: '2026-01-15T22:14:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8693'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T22:14:04Z'
---
# Docs: Clarify requestAnimationFrame usage in Canvas guides

Update `CanvasArchitecture.md`, `NeuralSwarm.md`, and `NeuralTimeline.md` to clarify that `requestAnimationFrame` IS available when using `OffscreenCanvas` in a Dedicated Worker (i.e., when `Neo.config.useSharedWorkers = false`).

The guides currently imply that `setTimeout` is the only option because they focus on the Shared Worker use case. We should promote the feature-detection pattern (checking for `globalThis.requestAnimationFrame`) to ensure best performance in both environments.

## Timeline

- 2026-01-15T22:06:17Z @tobiu added the `documentation` label
- 2026-01-15T22:06:17Z @tobiu added the `ai` label
- 2026-01-15T22:12:17Z @tobiu referenced in commit `2ce61a5` - "docs: Clarify rAF availability in Canvas guides (#8693)"
- 2026-01-15T22:13:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T22:13:46Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `learn/guides/advanced/CanvasArchitecture.md` and `learn/guides/advanced/NeuralTimeline.md` to clarify the availability of `requestAnimationFrame`.
> 
> 1.  **CanvasArchitecture.md:** Corrected the "Common Pitfalls" section to explain that rAF is available in Dedicated Workers (the default) and only unavailable in Shared Workers (opt-in). Added a code example for feature detection.
> 2.  **NeuralTimeline.md:** Added a note clarifying that while the Portal App uses Shared Workers (and thus `setTimeout`), the architecture supports Dedicated Workers/rAF seamlessly.
> 
> Verified and pushed to `dev`.

- 2026-01-15T22:14:04Z @tobiu closed this issue

