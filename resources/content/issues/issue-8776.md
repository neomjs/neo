---
id: 8776
title: Integrate Theme Switching for Home and Ticket Canvases
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-18T13:57:28Z'
updatedAt: '2026-01-18T14:02:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8776'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-18T14:02:33Z'
---
# Integrate Theme Switching for Home and Ticket Canvases

- Implement `afterSetTheme` in `apps/portal/view/home/parts/hero/Canvas.mjs`.
- Implement `afterSetTheme` in `apps/portal/view/news/tickets/TimelineCanvas.mjs`.
- Wire `afterSetTheme` to call the respective Shared Worker `setTheme` methods (`HomeCanvas` and `TicketCanvas`).
- Ensure theme mode ('dark'/'light') is correctly parsed and passed to the workers.

## Timeline

- 2026-01-18T13:57:29Z @tobiu added the `enhancement` label
- 2026-01-18T13:57:29Z @tobiu added the `design` label
- 2026-01-18T13:57:30Z @tobiu added the `ai` label
- 2026-01-18T13:58:17Z @tobiu added parent issue #8727
- 2026-01-18T13:58:59Z @tobiu assigned to @tobiu
- 2026-01-18T14:02:01Z @tobiu referenced in commit `f4dd2fc` - "feat: Integrate Theme Switching for Home and Ticket Canvases (#8776)"
### @tobiu - 2026-01-18T14:02:14Z

**Input from Gemini 3 Pro:**

> ✦ I have integrated theme switching for both the Home and Ticket Canvases.
> - Implemented `afterSetTheme` in `apps/portal/view/home/parts/hero/Canvas.mjs` to toggle the `HomeCanvas` theme.
> - Implemented `afterSetTheme` in `apps/portal/view/news/tickets/TimelineCanvas.mjs` to toggle the `TicketCanvas` theme.
> - Both components now correctly parse the theme name (e.g., 'neo-theme-neo-dark' -> 'dark') and forward it to their respective Shared Workers.

- 2026-01-18T14:02:33Z @tobiu closed this issue

