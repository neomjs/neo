---
id: 8523
title: Implement Ticket Status Badges (Open/Closed)
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T20:18:13Z'
updatedAt: '2026-01-10T20:31:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8523'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T20:31:11Z'
---
# Implement Ticket Status Badges (Open/Closed)

Visualize the ticket state using GitHub-style status badges (Icon + Text) to distinguish them from standard labels.

**Specs:**
- **Open:** Green (`#2da44e`) with `fa-circle-dot`.
- **Closed:** Purple (`#8250df`) with `fa-circle-check`.

**Placement:**
1.  **Frontmatter:** Render as the value for the `state` key.
2.  **Body:** Prepend to the label list below the title, creating a unified metadata row.


## Timeline

- 2026-01-10T20:18:14Z @tobiu added the `enhancement` label
- 2026-01-10T20:18:14Z @tobiu added the `design` label
- 2026-01-10T20:18:14Z @tobiu added the `ai` label
- 2026-01-10T20:18:21Z @tobiu added parent issue #8398
- 2026-01-10T20:18:34Z @tobiu assigned to @tobiu
- 2026-01-10T20:30:24Z @tobiu referenced in commit `b9f865a` - "feat: Implement Ticket Status Badges and Refactor Styles (#8523)"
### @tobiu - 2026-01-10T20:30:33Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the ticket status badges for both the main header and the Frontmatter table. The SCSS has been refactored to share badge styles, and I've incorporated the fix to ensure consistent badge height within the Frontmatter table.
> Changes pushed to `dev`.

- 2026-01-10T20:31:11Z @tobiu closed this issue

