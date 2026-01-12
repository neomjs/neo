---
id: 8035
title: Refine Visual Alignment and Button Typography
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-12-05T03:02:58Z'
updatedAt: '2025-12-05T03:27:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8035'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-05T03:27:56Z'
---
# Refine Visual Alignment and Button Typography

Address visual alignment issues and typography sizes in the AgentOS UI.

**Requirements:**
1.  **Dashboard Alignment:**
    -   Update `apps/agentos/view/Viewport.mjs`: Change Dashboard style from `margin: '20px'` to `margin: '20px 10px'` to align with the toolbar padding.

2.  **Typography Refinement:**
    -   **Base Buttons:** Increase `--button-text-font-size` to `13px` in `theme-cyberpunk` to improve legibility of Toolbar buttons.
    -   **Grid Header Buttons:** Refactor `src/grid/header/Button.scss` to use a variable `--grid-header-button-font-size`.
    -   **Theme Configuration:** Set `--grid-header-button-font-size` to `11px` in all themes to maintain compact layout.

## Timeline

- 2025-12-05T03:02:59Z @tobiu added the `enhancement` label
- 2025-12-05T03:02:59Z @tobiu added the `design` label
- 2025-12-05T03:02:59Z @tobiu added the `ai` label
- 2025-12-05T03:03:15Z @tobiu added parent issue #7918
- 2025-12-05T03:24:27Z @tobiu assigned to @tobiu
- 2025-12-05T03:25:18Z @tobiu referenced in commit `d3ec0a9` - "Refine Visual Alignment and Button Typography #8035"
- 2025-12-05T03:27:56Z @tobiu closed this issue

