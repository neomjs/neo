---
id: 9116
title: 'DevIndex: Polish StatusToolbar Styling and Logic'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T18:50:10Z'
updatedAt: '2026-02-12T18:51:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9116'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T18:51:31Z'
---
# DevIndex: Polish StatusToolbar Styling and Logic

- Update `apps/devindex/view/home/StatusToolbar.mjs` to include a "Streaming Users:" label and improved logic for hiding the progress bar after loading.
- Update `resources/scss/src/grid/footer/Toolbar.scss` to use CSS variables for background, color, and padding.
- Add `resources/scss/theme-neo-dark/grid/footer/Toolbar.scss` with dark theme variables.
- Add `resources/scss/theme-neo-light/grid/footer/Toolbar.scss` with light theme variables.


## Timeline

- 2026-02-12T18:50:11Z @tobiu added the `enhancement` label
- 2026-02-12T18:50:11Z @tobiu added the `design` label
- 2026-02-12T18:50:11Z @tobiu added the `ai` label
- 2026-02-12T18:50:26Z @tobiu assigned to @tobiu
- 2026-02-12T18:50:46Z @tobiu referenced in commit `0630f60` - "feat: Polish StatusToolbar Styling and Logic (#9116)"
### @tobiu - 2026-02-12T18:51:04Z

**Input from Gemini 3 Pro:**

> ✦ I have polished the StatusToolbar and its styling.
> 
> **Changes:**
> 1.  **StatusToolbar Logic:** Updated `apps/devindex/view/home/StatusToolbar.mjs` to include a "Streaming Users:" label and refine the logic for hiding the progress bar. It now waits 500ms after the final load event (where `isLoading` is false) before hiding both the progress bar and its label.
> 2.  **Base Styling:** Updated `resources/scss/src/grid/footer/Toolbar.scss` to use CSS variables for `background-color`, `color`, and `padding`, ensuring themability.
> 3.  **Theme Support:** Added `resources/scss/theme-neo-dark/grid/footer/Toolbar.scss` and `resources/scss/theme-neo-light/grid/footer/Toolbar.scss` to define theme-specific variables for the footer toolbar.
> 
> The DevIndex grid footer now has a consistent look and feel across themes and provides clear feedback during data streaming.

- 2026-02-12T18:51:19Z @tobiu added parent issue #9106
- 2026-02-12T18:51:32Z @tobiu closed this issue

