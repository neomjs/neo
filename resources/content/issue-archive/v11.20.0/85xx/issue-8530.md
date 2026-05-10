---
id: 8530
title: Integrate Ticket Body into Timeline view
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-01-10T23:18:46Z'
updatedAt: '2026-01-10T23:55:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8530'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T23:55:21Z'
---
# Integrate Ticket Body into Timeline view

Refactor `Portal.view.news.tickets.Component` to render the main issue body as the first item inside the `.neo-ticket-timeline` container.
- Extract `author` and `createdAt` from frontmatter.
- Wrap the markdown body content in a `.neo-timeline-item.comment` structure.
- Ensure H1 and Badges remain outside/above the timeline.

## Timeline

- 2026-01-10T23:18:47Z @tobiu added the `enhancement` label
- 2026-01-10T23:18:47Z @tobiu added the `design` label
- 2026-01-10T23:19:01Z @tobiu added parent issue #8398
- 2026-01-10T23:54:16Z @tobiu referenced in commit `8e297e8` - "feat: Integrate Ticket Body into Timeline view (#8530)"
- 2026-01-10T23:54:36Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T23:54:50Z

**Input from Gemini 3 Pro:**

> ✦ Refactored the Ticket View to integrate the issue body into the timeline conversation.
> 
> ### Changes
> - **Frontmatter Widget:** Extracted frontmatter (table) to render as a distinct, collapsible widget at the very top of the view (above the title).
> - **Body Bubble:** The main issue description is now rendered as the first bubble in the timeline, complete with the author's avatar and creation timestamp.
> - **Unified Timeline:** The vertical axis now connects the Body Bubble to all subsequent events and comments.
> 
> Verified on `dev`. (#8530)

- 2026-01-10T23:55:22Z @tobiu closed this issue

