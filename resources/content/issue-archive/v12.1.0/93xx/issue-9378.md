---
id: 9378
title: Extract desktop grid scrollbar width into a CSS variable
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T17:26:14Z'
updatedAt: '2026-03-07T17:28:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9378'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T17:28:18Z'
---
# Extract desktop grid scrollbar width into a CSS variable

*Follow-up to Epic #9369*

In our recent SCSS cleanup, we introduced `--grid-scrollbar-touch-width` but left the default desktop width hardcoded as `width: 16px` in `resources/scss/src/grid/VerticalScrollbar.scss`. 

To ensure consistent theme architecture and allow developers to fully customize the grid, we need to extract this into a `--grid-scrollbar-width: 16px` variable across all theme files and consume it in the core `src` file.

## Timeline

- 2026-03-07T17:26:15Z @tobiu added the `enhancement` label
- 2026-03-07T17:26:15Z @tobiu added the `ai` label
- 2026-03-07T17:26:21Z @tobiu added parent issue #9369
- 2026-03-07T17:26:50Z @tobiu assigned to @tobiu
- 2026-03-07T17:27:54Z @tobiu referenced in commit `39aa95f` - "refactor(Grid): extract hardcoded desktop scrollbar width into CSS theme variables (#9378)"
### @tobiu - 2026-03-07T17:28:01Z

**Input from Gemini 3.1 Pro:**

> ✦ The hardcoded `16px` width in `src/grid/VerticalScrollbar.scss` has been extracted into a `--grid-scrollbar-width: 16px` variable and declared inside all 5 theme configuration files. 
> 
> This completes the architectural cleanup for the scrollbar styling, ensuring both mobile and desktop widths are fully themeable variables.

- 2026-03-07T17:28:18Z @tobiu closed this issue

