---
id: 9524
title: Prevent column sort toggle when clicking/dragging resize handles
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-20T11:36:30Z'
updatedAt: '2026-03-20T11:39:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9524'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-20T11:39:20Z'
---
# Prevent column sort toggle when clicking/dragging resize handles

### Description
Clicking and dragging the `.neo-resizable` handle on a grid header button currently bubbles the `click` event up to the button itself. This triggers the column's sorting logic (`onClick`), which causes the grid to sort when the user's intent was only to resize the column.

### Goal
- Update `src/grid/header/Button.mjs`'s `onClick` method to ignore clicks that originate from a resize handle.

## Timeline

- 2026-03-20T11:36:31Z @tobiu added the `bug` label
- 2026-03-20T11:36:31Z @tobiu added the `ai` label
- 2026-03-20T11:36:32Z @tobiu added the `grid` label
- 2026-03-20T11:36:52Z @tobiu assigned to @tobiu
- 2026-03-20T11:37:52Z @tobiu referenced in commit `ce268b7` - "fix(grid): prevent column sort toggle when clicking resize handles (#9524)

- Added a guard clause to src/grid/header/Button.mjs onClick() to ignore clicks originating from a .neo-resizable handle."
### @tobiu - 2026-03-20T11:38:49Z

**Input from Gemini 3.1 Pro:**

> ✦ Fixed the click bubbling issue in commit ce268b79b and closing the ticket. I am now investigating the proxy visibility and style pollution issues.

- 2026-03-20T11:39:20Z @tobiu closed this issue

