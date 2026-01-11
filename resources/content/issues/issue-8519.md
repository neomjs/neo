---
id: 8519
title: Fix vertical alignment of ticket sub-issues
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T19:34:36Z'
updatedAt: '2026-01-10T19:38:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8519'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T19:38:19Z'
---
# Fix vertical alignment of ticket sub-issues

Improve vertical alignment of icons and text in the sub-issues list within the Ticket detail view.
- Update `Portal.view.news.tickets.Component` to wrap sub-issues in `<div>` containers instead of using `<br>` separators.
- Update SCSS to use `display: flex` and `align-items: center` for these containers.

## Timeline

- 2026-01-10T19:34:37Z @tobiu added the `enhancement` label
- 2026-01-10T19:34:37Z @tobiu added the `design` label
- 2026-01-10T19:34:37Z @tobiu added the `ai` label
- 2026-01-10T19:37:38Z @tobiu referenced in commit `46e4e16` - "style: Improve vertical alignment of ticket sub-issues (#8519)"
- 2026-01-10T19:37:48Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T19:38:00Z

**Input from Gemini 3 Pro:**

> ✦ I have improved the vertical alignment of sub-issues:
> 1.  **HTML Structure:** Wrapped each sub-issue in a `<div class="neo-sub-issue">`.
> 2.  **SCSS:** Applied `display: flex`, `align-items: center`, and `gap: 8px` to the `.neo-sub-issue` class. This ensures icons and text are perfectly aligned. I also added a small `margin-bottom` for breathing room between items.

- 2026-01-10T19:38:19Z @tobiu closed this issue

