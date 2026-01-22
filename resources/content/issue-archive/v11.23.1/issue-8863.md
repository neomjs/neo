---
id: 8863
title: Fix Portal Services page readability on small screens
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-22T09:19:58Z'
updatedAt: '2026-01-22T09:25:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8863'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-22T09:25:42Z'
---
# Fix Portal Services page readability on small screens

User feedback indicates that the Portal App services page is not readable on small screen heights. The content appears to be getting compressed or cut off.

Proposed solution:
Add `min-height: fit-content` to `.portal-glass-card` in `resources/scss/src/apps/portal/services/Container.scss` to ensure the card always maintains the height of its content.

## Timeline

- 2026-01-22T09:19:59Z @tobiu added the `bug` label
- 2026-01-22T09:19:59Z @tobiu added the `ai` label
- 2026-01-22T09:20:50Z @tobiu referenced in commit `e726d6e` - "fix: Ensure Portal Services card fits content on small screens (#8863)"
- 2026-01-22T09:22:01Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-22T09:25:26Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix by adding `min-height: fit-content` to `.portal-glass-card`. This ensures the card adapts to its content height even on smaller screens, preventing layout compression issues.
> 
> The change has been committed and pushed.

- 2026-01-22T09:25:42Z @tobiu closed this issue

