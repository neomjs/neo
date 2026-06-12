---
id: 8667
title: Optimize HomeCanvas Rendering (Gradient Caching)
state: CLOSED
labels:
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T01:54:46Z'
updatedAt: '2026-01-15T01:59:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8667'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T01:59:42Z'
---
# Optimize HomeCanvas Rendering (Gradient Caching)

- Implement `updateResources(width, height)` to cache the background gradient.
- Remove `ctx.createLinearGradient` from the `render` loop to strictly adhere to the Zero-Allocation strategy.
- Ensure gradients are updated on resize.

## Timeline

- 2026-01-15T01:54:47Z @tobiu added the `ai` label
- 2026-01-15T01:54:47Z @tobiu added the `performance` label
- 2026-01-15T01:55:00Z @tobiu added parent issue #8661
- 2026-01-15T01:59:08Z @tobiu referenced in commit `597d3f5` - "refactor: Optimize HomeCanvas with Gradient Caching (#8667)"
- 2026-01-15T01:59:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T01:59:27Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Gradient Caching for the HomeCanvas renderer.
> - Implemented `updateResources(width, height)` to create and cache the `bgGradient` linear gradient.
> - Called `updateResources` in `updateSize` and `initGraph`.
> - Replaced `ctx.createLinearGradient` inside the `render` loop with the cached `me.gradients.bgGradient`.
> 
> This optimization eliminates object allocation for gradients in the critical render path, adhering to the Zero-Allocation strategy.

- 2026-01-15T01:59:43Z @tobiu closed this issue

