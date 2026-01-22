---
id: 8743
title: Refactor Portal HeaderCanvas View for Theme Propagation
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T03:03:04Z'
updatedAt: '2026-01-17T03:05:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8743'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T03:05:39Z'
---
# Refactor Portal HeaderCanvas View for Theme Propagation

Implement `afterSetTheme` in `apps/portal/view/HeaderCanvas.mjs` to propagate theme changes to the Shared Worker.
This enables the canvas to react to theme switches (e.g. toggling between light and dark modes).

## Timeline

- 2026-01-17T03:03:05Z @tobiu added the `enhancement` label
- 2026-01-17T03:03:05Z @tobiu added the `design` label
- 2026-01-17T03:03:06Z @tobiu added the `ai` label
- 2026-01-17T03:03:40Z @tobiu referenced in commit `9644c16` - "feat: Implement theme propagation in HeaderCanvas View (#8743)"
- 2026-01-17T03:03:50Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T03:04:38Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `afterSetTheme` in `apps/portal/view/HeaderCanvas.mjs`.
> This ensures that when the application theme changes (e.g. via the Theme Switcher), the new state is correctly propagated to the Shared Worker's `HeaderCanvas` singleton, allowing it to update its visual rendering loop.

- 2026-01-17T03:05:40Z @tobiu closed this issue
- 2026-01-17T04:15:34Z @tobiu added parent issue #8727

