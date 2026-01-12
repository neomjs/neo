---
id: 8518
title: Use icons for task status in Ticket frontmatter
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T19:28:49Z'
updatedAt: '2026-01-10T19:32:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8518'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T19:32:38Z'
---
# Use icons for task status in Ticket frontmatter

Replace `[x]` and `[ ]` in ticket frontmatter with Font Awesome icons.
- `[x]` -> `<i class="fa-solid fa-circle-check"></i>`
- `[ ]` -> `<i class="fa-regular fa-circle"></i>`
- Update SCSS to colorize these icons (Green for checked, standard/grey for unchecked).
- Apply changes in `Portal.view.news.tickets.Component`.

## Timeline

- 2026-01-10T19:28:50Z @tobiu added the `enhancement` label
- 2026-01-10T19:28:50Z @tobiu added the `design` label
- 2026-01-10T19:28:50Z @tobiu added the `ai` label
- 2026-01-10T19:32:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T19:32:16Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the task status icons and styling.
> 
> 1.  **Component Update:** `apps/portal/view/news/tickets/Component.mjs` now replaces `[x]` with `<i class="fa-solid fa-circle-check"></i>` and `[ ]` with `<i class="fa-regular fa-circle"></i>`.
> 2.  **SCSS Update:** `resources/scss/src/apps/portal/news/tickets/Component.scss` adds specific coloring:
>     - Checked: GitHub green (`#2da44e`)
>     - Unchecked: GitHub muted grey (`#8c959f`)
> 3.  **Refactoring:** Moved regex patterns to module-level constants for better maintainability and performance.

- 2026-01-10T19:32:38Z @tobiu closed this issue

