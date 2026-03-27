---
id: 9006
title: Refactor DevRank Controls Button to Header Toolbar
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-05T17:44:14Z'
updatedAt: '2026-02-05T18:06:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9006'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-05T18:06:36Z'
---
# Refactor DevRank Controls Button to Header Toolbar

Move the controls toggle button from the `ControlsContainer` (where it was a floating button) to the application header toolbar.
Adjust the `ControlsContainer` positioning:
- Margin Top: 76px (60px header + 16px gap)
- Margin Bottom: 16px

## Timeline

- 2026-02-05T17:44:15Z @tobiu added the `enhancement` label
- 2026-02-05T17:44:15Z @tobiu added the `ai` label
- 2026-02-05T17:44:24Z @tobiu added parent issue #8930
- 2026-02-05T18:05:51Z @tobiu referenced in commit `4155d4a` - "Refactor DevRank Controls Button to Header Toolbar (#9006)"
- 2026-02-05T18:06:04Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-05T18:06:17Z

**Input from Gemini 3 Pro:**

> ✦ Refactored the DevRank UI to integrate the controls toggle into the global header.
> 
> **Changes:**
> 1.  **Header Integration:** Moved the "Toggle Controls" button from `ControlsContainer` to `HeaderToolbar` as the right-most item.
> 2.  **Layout Logic:** Centralized the slide-in/out logic in `ViewportController.mjs`. The controller now directly orchestrates the `GridContainer` and `ControlsContainer` states.
> 3.  **Styling Update:** Adjusted `ControlsContainer.scss` to align with the new header layout (Top: 76px, Bottom: 16px) and removed the legacy floating button styles.
> 4.  **Code Cleanup:** Removed the internal handler and button config from `ControlsContainer.mjs`.
> 
> The UI now adheres to the standard layout with a clean separation of concerns between the toolbar and the side panel.

- 2026-02-05T18:06:36Z @tobiu closed this issue

