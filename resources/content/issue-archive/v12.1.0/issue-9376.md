---
id: 9376
title: Add .neo-has-touch capability class and enhance Mobile Grid Scrollbar
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T17:10:44Z'
updatedAt: '2026-03-07T17:15:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9376'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:15:16Z'
---
# Add .neo-has-touch capability class and enhance Mobile Grid Scrollbar

*Part of Epic #9369*

1.  **Capability Flag:** Update `src/worker/Manager.mjs` to explicitly add a `.neo-has-touch` class to the `document.body` if `Neo.config.hasTouchEvents` is true. This supports hybrid devices (laptops with touchscreens) better than the archaic mobile/desktop paradigm.
2.  **Grid Scrollbar UX:** Update `resources/scss/src/grid/VerticalScrollbar.scss`. When the `.neo-has-touch` class is present, enforce `opacity: 1` and set a larger width (`24px`) for both the scrollbar container and the `::-webkit-scrollbar` pseudo-element. This ensures the native scrollbar is always visible and provides a viable touch target for users to grab and scrub.

## Timeline

- 2026-03-07T17:10:45Z @tobiu added the `enhancement` label
- 2026-03-07T17:10:45Z @tobiu added the `ai` label
- 2026-03-07T17:10:54Z @tobiu added parent issue #9369
- 2026-03-07T17:13:35Z @tobiu assigned to @tobiu
- 2026-03-07T17:13:41Z @tobiu referenced in commit `2df5a41` - "feat(Grid): add .neo-has-touch capability flag and enhance mobile scrollbar UX (#9374, #9376)"
### @tobiu - 2026-03-07T17:14:45Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `.neo-has-touch` capability class inside `src/worker/Manager.mjs` and used it in the SCSS files to ensure the vertical scrollbar is permanently visible and has a larger touch-friendly width (`24px`) on all devices that support touch input, regardless of whether a mouse is also present.
> 
> This completes the epic!

- 2026-03-07T17:15:16Z @tobiu closed this issue
- 2026-03-07T17:19:16Z @tobiu cross-referenced by #9377
- 2026-03-07T17:56:59Z @tobiu cross-referenced by #9379

