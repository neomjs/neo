---
id: 9374
title: Mobile UX Enhancements for Grid VerticalScrollbar (SCSS)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-07T16:39:39Z'
updatedAt: '2026-03-07T17:15:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9374'
author: tobiu
commentsCount: 0
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:15:05Z'
---
# Mobile UX Enhancements for Grid VerticalScrollbar (SCSS)

*Part of Epic #9369*

Update `resources/scss/src/grid/VerticalScrollbar.scss` to ensure the native scrollbar is accessible on touch devices. Enforce `opacity: 1` and a larger touch-friendly width (e.g., `24px`) when a `.neo-is-mobile` or `.neo-has-touch` class is present on the body, allowing users to easily grab the native scrollbar thumb.

## Timeline

- 2026-03-07T16:39:40Z @tobiu added the `enhancement` label
- 2026-03-07T16:39:40Z @tobiu added the `ai` label
- 2026-03-07T16:39:40Z @tobiu added the `architecture` label
- 2026-03-07T16:39:56Z @tobiu added parent issue #9369
- 2026-03-07T17:13:29Z @tobiu assigned to @tobiu
- 2026-03-07T17:13:41Z @tobiu referenced in commit `2df5a41` - "feat(Grid): add .neo-has-touch capability flag and enhance mobile scrollbar UX (#9374, #9376)"
- 2026-03-07T17:15:05Z @tobiu closed this issue

