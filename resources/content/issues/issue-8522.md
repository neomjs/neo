---
id: 8522
title: Use Badge Style for Labels in Ticket Frontmatter
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T20:09:29Z'
updatedAt: '2026-01-10T20:11:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8522'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T20:11:49Z'
---
# Use Badge Style for Labels in Ticket Frontmatter

Refactor `Portal.view.news.tickets.Component` to render `labels` in the Frontmatter table using the same badge style as the main header.

**Tasks:**
1. Extract badge generation logic into `getBadgesHtml`.
2. Update `frontMatterToHtml` to use this method for the `labels` key.
3. Adjust SCSS to remove unnecessary margins when badges are rendered inside the table.


## Timeline

- 2026-01-10T20:09:30Z @tobiu added the `enhancement` label
- 2026-01-10T20:09:31Z @tobiu added the `ai` label
- 2026-01-10T20:09:40Z @tobiu added parent issue #8398
- 2026-01-10T20:09:44Z @tobiu assigned to @tobiu
- 2026-01-10T20:11:26Z @tobiu referenced in commit `8f88162` - "feat: Use badge style for Frontmatter labels (#8522)"
### @tobiu - 2026-01-10T20:11:35Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `Component.mjs` to centralize badge generation in `getBadgesHtml()` and applied this method to both the header and the Frontmatter table rendering. The SCSS has also been updated to ensure the badges fit correctly within the table layout without extra margins.
> Changes pushed to `dev`.

- 2026-01-10T20:11:49Z @tobiu closed this issue

