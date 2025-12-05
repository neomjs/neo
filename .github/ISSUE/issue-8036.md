---
id: 8036
title: Increase Toolbar Padding to 20px
state: OPEN
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T03:27:54Z'
updatedAt: '2025-12-05T03:28:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8036'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Increase Toolbar Padding to 20px

Align the Toolbar padding with the Dashboard margin by increasing the Toolbar's horizontal padding to 20px.

**Requirements:**
1.  **Toolbar:** Update `resources/scss/src/apps/agentos/Viewport.scss`: Change `.agent-top-toolbar` padding from `0 10px` to `0 20px`.
2.  **Dashboard:** Revert `apps/agentos/view/Viewport.mjs` margin to `20px` (from `20px 10px`).

**Goal:**
Create a consistent 20px horizontal gutter for the main application layout.

## Activity Log

- 2025-12-05 @tobiu added the `enhancement` label
- 2025-12-05 @tobiu added the `design` label
- 2025-12-05 @tobiu added the `ai` label
- 2025-12-05 @tobiu added parent issue #7918
- 2025-12-05 @tobiu assigned to @tobiu

