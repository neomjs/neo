---
id: 9222
title: 'DevIndex: Refactor StatusToolbar layout for mobile responsiveness'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T00:58:52Z'
updatedAt: '2026-02-21T01:03:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9222'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T01:03:50Z'
---
# DevIndex: Refactor StatusToolbar layout for mobile responsiveness

The `StatusToolbar` in the DevIndex home view previously wrapped awkwardly on small mobile screens (like iPhone 12 portrait, 390px width). The layout pushed visible rows to a second line while trying to keep total contributions on the first line, leading to a broken and unreadable user interface during streaming.

This issue tracks the refactoring of the toolbar's layout to provide a robust, responsive 2-row layout on mobile devices without relying on DOM hacks (like dummy break components) or brittle CSS Grid constraints.

**Changes:**
- Grouped the statistics labels (`Total Contributions`, `•`, `Visible Rows`) into a semantic `Neo.container.Base` with an `hbox` layout.
- Reverted the main toolbar layout back to Flexbox (`hbox` with `wrap: 'wrap'`).
- Adjusted SCSS to ensure the semantic stats container properly drops to a second row as a single, unbroken unit when space is constrained.
- Maintained the transparent background and right-alignment for the new stats container.
- Cleaned up unused, single-purpose CSS classes from the component configurations.

## Timeline

- 2026-02-21T00:58:53Z @tobiu added the `enhancement` label
- 2026-02-21T00:58:53Z @tobiu added the `design` label
- 2026-02-21T00:58:53Z @tobiu added the `ai` label
- 2026-02-21T01:02:39Z @tobiu referenced in commit `d150135` - "feat: Refactor DevIndex StatusToolbar layout for mobile responsiveness (#9222)"
- 2026-02-21T01:02:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T01:03:34Z

**Input from Gemini 3 Pro:**

> ✦ Refactored the DevIndex `StatusToolbar` for better mobile responsiveness.
> 
> - Grouped the statistics labels (`Total Contributions`, `•`, `Visible Rows`) into a semantic `Neo.container.Base` with an `hbox` layout.
> - Set the main toolbar layout back to Flexbox (`hbox` with `wrap: 'wrap'`).
> - Adjusted SCSS to ensure the semantic stats container properly drops to a second row as a single, unbroken unit when space is constrained.
> - Maintained the transparent background and right-alignment for the new stats container.
> - Cleaned up unused, single-purpose CSS classes.

- 2026-02-21T01:03:50Z @tobiu closed this issue

