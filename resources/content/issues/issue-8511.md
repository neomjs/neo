---
id: 8511
title: Enhance Ticket Markdown Rendering with Badges
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T17:27:59Z'
updatedAt: '2026-01-10T17:42:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8511'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T17:41:03Z'
---
# Enhance Ticket Markdown Rendering with Badges

Implement logic in `apps/portal/view/news/tickets/Component.mjs` to extract labels from frontmatter and render them as styled badges below the ticket title.
This enhances the visual hierarchy and provides immediate context about the ticket type.

Tasks:
1. Override `modifyMarkdown` in `Portal.view.news.tickets.Component`.
2. Extract labels from frontmatter.
3. Inject badge HTML after the title.
4. Add SCSS styles for the badges.

## Timeline

- 2026-01-10T17:28:00Z @tobiu added the `documentation` label
- 2026-01-10T17:28:00Z @tobiu added the `enhancement` label
- 2026-01-10T17:28:00Z @tobiu added the `ai` label
- 2026-01-10T17:39:43Z @tobiu referenced in commit `6b3ad23` - "feat: Implement Ticket Badges in Markdown (#8511)"
### @tobiu - 2026-01-10T17:40:14Z

**Input from Gemini 3 Pro:**

> ✦ Implemented ticket badge rendering in `Portal.view.news.tickets.Component`.
> - Overrode `modifyMarkdown` to parse frontmatter labels.
> - Added SCSS for badges matching GitHub label colors.
> - Created standalone `Component.scss` for the styles.
> - Updated component config to include the new CSS class.

- 2026-01-10T17:41:04Z @tobiu closed this issue
- 2026-01-10T17:41:28Z @tobiu assigned to @tobiu
- 2026-01-10T17:43:12Z @tobiu added parent issue #8398

