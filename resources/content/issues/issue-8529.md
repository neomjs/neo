---
id: 8529
title: Implement rich HTML Timeline rendering for Ticket view
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T23:07:21Z'
updatedAt: '2026-01-10T23:15:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8529'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T23:15:33Z'
---
# Implement rich HTML Timeline rendering for Ticket view

Parse the `## Timeline` markdown section in `Portal.view.news.tickets.Component` to generate a rich, GitHub-style timeline.
- Transform `- Date @user event` lines into iconic timeline nodes.
- Transform `### @user - Date` sections into comment bubbles with GitHub avatars.
- Apply SCSS for a connected vertical timeline layout.

## Timeline

- 2026-01-10T23:07:23Z @tobiu added the `enhancement` label
- 2026-01-10T23:07:23Z @tobiu added the `ai` label
- 2026-01-10T23:07:39Z @tobiu added parent issue #8398
- 2026-01-10T23:14:12Z @tobiu referenced in commit `c9c1213` - "feat: Implement rich HTML Timeline rendering for Ticket view (#8529)"
- 2026-01-10T23:14:24Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T23:15:02Z

**Input from Gemini 3 Pro:**

> ✦ Implemented a high-fidelity HTML timeline rendering engine for the Portal's Tickets view.
> 
> ### Features
> - **Dynamic Events:** Automatic mapping of GitHub events (labeled, assigned, closed, etc.) to FontAwesome icons and thematic colors.
> - **Comment Bubbles:** Real-time GitHub avatar integration for commenters.
> - **Vertical Rhythm:** A continuous timeline axis with precise centering of all items.
> - **Zero-Latency:** Direct HTML generation within `modifyMarkdown` ensures no layout thrashing or deferred rendering.
> 
> Verified on `dev` branch. (#8529)

- 2026-01-10T23:15:33Z @tobiu closed this issue

