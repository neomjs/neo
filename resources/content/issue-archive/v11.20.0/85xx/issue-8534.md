---
id: 8534
title: 'Portal Ticket Timeline: Render Labels as Badges'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T01:04:47Z'
updatedAt: '2026-01-11T01:12:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8534'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T01:12:15Z'
---
# Portal Ticket Timeline: Render Labels as Badges

Enhance the ticket timeline rendering to display GitHub labels as colored badges instead of plain code blocks.

**Current Behavior:**
Timeline events like "added the `bug` label" render the label name as a generic `<code>bug</code>` block.

**Desired Behavior:**
Detect label-related events and render the label using the standard `<span class="neo-badge">` component, applying the correct background and text color from the `labels` store. This improves visual scanning and consistency with the ticket header.

**Implementation Details:**
- Modify `Portal.view.news.tickets.Component` -> `renderTimeline`.
- Intercept "added the" / "removed the" events.
- Extract the label name from backticks.
- Lookup the label color in the `labels` store.
- Generate the badge HTML.

## Timeline

- 2026-01-11T01:04:48Z @tobiu added the `enhancement` label
- 2026-01-11T01:04:48Z @tobiu added the `ai` label
- 2026-01-11T01:10:16Z @tobiu referenced in commit `967c581` - "feat: Render labels as badges in timeline & refactor event icons (#8534)"
- 2026-01-11T01:11:42Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T01:11:56Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the label badges in the timeline and refactored the event icon logic.
> - Labels in "added/removed" events now render as colored badges.
> - Refactored the if/else event detection logic to use a cleaner array-based lookup (Map-like approach).
> - Reused the `getLabelBadgeHtml` helper for consistency.

- 2026-01-11T01:12:15Z @tobiu closed this issue
- 2026-01-11T01:13:04Z @tobiu added parent issue #8398

