---
id: 8557
title: Fix Ticket Timeline content overflow
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T17:51:23Z'
updatedAt: '2026-01-11T17:56:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8557'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T17:56:28Z'
---
# Fix Ticket Timeline content overflow

Long content (e.g., file paths, long words) inside the Ticket Timeline view is currently overflowing its container, breaking the layout.

**Solution:**
- Apply `overflow-wrap: anywhere` (or `break-word`) to timeline body content.
- Ensure preformatted code blocks scroll horizontally instead of overflowing.

## Timeline

- 2026-01-11T17:51:24Z @tobiu added the `bug` label
- 2026-01-11T17:51:24Z @tobiu added the `ai` label
- 2026-01-11T17:51:31Z @tobiu added parent issue #8398
- 2026-01-11T17:56:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T17:56:15Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix in `resources/scss/src/apps/portal/news/tickets/Component.scss`.
> 
> **Changes:**
> - Added `overflow-wrap: anywhere` to `.neo-timeline-body` to force long strings (like file paths) to break.
> - Added `overflow-x: auto` to `pre` tags to ensure code blocks scroll horizontally instead of breaking layout.

- 2026-01-11T17:56:28Z @tobiu closed this issue

