---
id: 8847
title: Fix Dark Theme for HighlightJS
state: CLOSED
labels:
  - bug
  - design
assignees:
  - tobiu
createdAt: '2026-01-21T11:37:20Z'
updatedAt: '2026-01-21T11:41:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8847'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T11:41:20Z'
---
# Fix Dark Theme for HighlightJS

Update the SCSS variables for HighlightJS and LineNumbers in the dark theme to use appropriate dark mode colors.

**Files to Update:**
1.  `resources/scss/theme-neo-dark/util/HighlightJs.scss`: Use a dark palette (e.g., GitHub Dark).
2.  `resources/scss/theme-neo-dark/util/HighlightJsLineNumbers.scss`: Use dark background and lighter text for line numbers.

**Current State:**
The dark theme files currently contain light theme colors (white background), causing visual artifacts in the Portal App's dark mode.


## Timeline

- 2026-01-21T11:37:22Z @tobiu added the `bug` label
- 2026-01-21T11:37:22Z @tobiu added the `design` label
- 2026-01-21T11:38:25Z @tobiu added parent issue #8727
- 2026-01-21T11:40:15Z @tobiu referenced in commit `18bf5b4` - "fix: Fix Dark Theme for HighlightJS (#8847)"
### @tobiu - 2026-01-21T11:40:43Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the dark theme colors for HighlightJS.
> 
> **Changes:**
> 1.  **Updated `resources/scss/theme-neo-dark/util/HighlightJs.scss`:** Applied a GitHub Dark inspired palette (dark background `#0d1117`, light syntax highlighting colors) to replace the incorrect light theme values.
> 2.  **Updated `resources/scss/theme-neo-dark/util/HighlightJsLineNumbers.scss`:** Applied dark background and dim text colors for line numbers.
> 
> Since the SCSS variables are scoped to `.neo-theme-neo-dark`, and `Neo.util.HighlightJs` ensures the CSS files are loaded, switching the theme on the Portal Viewport will now automatically apply these corrected styles to all markdown code blocks.

- 2026-01-21T11:40:57Z @tobiu assigned to @tobiu
- 2026-01-21T11:41:20Z @tobiu closed this issue

