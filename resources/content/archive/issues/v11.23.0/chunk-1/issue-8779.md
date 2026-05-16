---
id: 8779
title: Standardize HeaderCanvas Configuration
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-18T14:40:34Z'
updatedAt: '2026-01-18T14:45:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8779'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T14:45:10Z'
---
# Standardize HeaderCanvas Configuration

- Refactor `isCanvasReady` from a class field to a reactive config `isCanvasReady_` in `apps/portal/view/HeaderCanvas.mjs` to match the pattern used in other canvas components.
- Implement `afterSetIsCanvasReady` to handle initial theme setting and active ID updates once the canvas is ready.
- Update `afterSetTheme` to check `isCanvasReady` before calling the remote method, preventing race conditions.
- Update `afterSetOffscreenRegistered` to toggle `isCanvasReady` via the config setter.

## Timeline

- 2026-01-18T14:40:36Z @tobiu added the `enhancement` label
- 2026-01-18T14:40:36Z @tobiu added the `ai` label
- 2026-01-18T14:40:36Z @tobiu added the `refactoring` label
- 2026-01-18T14:40:45Z @tobiu added parent issue #8727
- 2026-01-18T14:40:56Z @tobiu assigned to @tobiu
- 2026-01-18T14:44:31Z @tobiu referenced in commit `c8eb899` - "feat: Standardize HeaderCanvas Configuration (#8779)"
### @tobiu - 2026-01-18T14:44:52Z

**Input from Gemini 3 Pro:**

> ✦ I have standardized the `HeaderCanvas` configuration to match the other portal canvases.
> - Refactored `isCanvasReady` to a reactive config.
> - Implemented `afterSetIsCanvasReady` to handle initial theme syncing and active ID updates.
> - Updated `afterSetTheme` to prevent race conditions.

- 2026-01-18T14:45:11Z @tobiu closed this issue

