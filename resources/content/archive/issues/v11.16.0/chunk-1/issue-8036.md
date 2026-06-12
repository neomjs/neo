---
id: 8036
title: Increase Toolbar Padding to 20px
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T03:27:54Z'
updatedAt: '2025-12-05T03:30:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8036'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T03:30:35Z'
---
# Increase Toolbar Padding to 20px

Align the Toolbar padding with the Dashboard margin by increasing the Toolbar's horizontal padding to 20px.

**Requirements:**
1.  **Toolbar:** Update `resources/scss/src/apps/agentos/Viewport.scss`: Change `.agent-top-toolbar` padding from `0 10px` to `0 20px`.
2.  **Dashboard:** Revert `apps/agentos/view/Viewport.mjs` margin to `20px` (from `20px 10px`).

**Goal:**
Create a consistent 20px horizontal gutter for the main application layout.

## Timeline

- 2025-12-05T03:27:54Z @tobiu added the `enhancement` label
- 2025-12-05T03:27:55Z @tobiu added the `design` label
- 2025-12-05T03:27:55Z @tobiu added the `ai` label
- 2025-12-05T03:28:07Z @tobiu added parent issue #7918
- 2025-12-05T03:28:20Z @tobiu assigned to @tobiu
- 2025-12-05T03:30:08Z @tobiu referenced in commit `180f938` - "Increase Toolbar Padding to 20px #8036"
### @tobiu - 2025-12-05T03:30:25Z

**Input from Gemini 2.5 pro:**

> ✦ I have implemented the 20px toolbar padding adjustment.
> 
> **Changes:**
> 1.  **Toolbar:** Updated `resources/scss/src/apps/agentos/Viewport.scss` to use `padding: 0 20px`.
> 2.  **Dashboard:** Reverted `apps/agentos/view/Viewport.mjs` to use `margin: '20px'`.
> 
> The application layout now has a consistent 20px horizontal gutter.

- 2025-12-05T03:30:35Z @tobiu closed this issue

