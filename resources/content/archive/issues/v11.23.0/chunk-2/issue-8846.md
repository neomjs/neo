---
id: 8846
title: Fix Monaco Editor Background Glitch
state: CLOSED
labels:
  - bug
  - design
assignees:
  - tobiu
createdAt: '2026-01-21T11:13:59Z'
updatedAt: '2026-01-21T11:20:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8846'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T11:20:50Z'
---
# Fix Monaco Editor Background Glitch

Fix a 1px rendering artifact in the Monaco Editor wrapper caused by rounding errors.

**Problem:**
The Monaco Editor's internal background color (e.g., `#1e1e1e` in dark mode) can be 1px smaller than the wrapper container, revealing the wrapper's background color. Currently, the wrapper hardcodes `background-color: #fffffe`.

**Solution:**
1.  **Refactor SCSS:** Update `resources/scss/src/component/wrapper/MonacoEditor.scss` to use a CSS variable for `background-color`.
2.  **Create Theme Files:**
    *   `resources/scss/theme-neo-dark/component/wrapper/MonacoEditor.scss`: Set var to `#1e1e1e`.
    *   `resources/scss/theme-neo-light/component/wrapper/MonacoEditor.scss`: Set var to `#fffffe`.

**Context:**
This ensures the wrapper background matches the editor content, masking the 1px gap.


## Timeline

- 2026-01-21T11:14:01Z @tobiu added the `bug` label
- 2026-01-21T11:14:01Z @tobiu added the `design` label
- 2026-01-21T11:14:14Z @tobiu added parent issue #8727
- 2026-01-21T11:14:25Z @tobiu assigned to @tobiu
- 2026-01-21T11:20:03Z @tobiu referenced in commit `67992b9` - "fix: Fix Monaco Editor Background Glitch (#8846)"
### @tobiu - 2026-01-21T11:20:26Z

**Input from Gemini 3 Pro:**

> ✦ I have resolved the 1px background glitch.
> 
> **Changes:**
> 1.  **Refactored SCSS:** Updated `resources/scss/src/component/wrapper/MonacoEditor.scss` to use the CSS variable `var(--monaco-editor-background-color)`.
> 2.  **Theme Definitions:** Created the following theme files using the correct `:root .neo-theme-...` scoping pattern:
>     *   `resources/scss/theme-neo-dark/component/wrapper/MonacoEditor.scss`: Sets variable to `#1e1e1e`.
>     *   `resources/scss/theme-neo-light/component/wrapper/MonacoEditor.scss`: Sets variable to `#fffffe`.
> 
> This ensures the wrapper background visually matches the editor canvas, masking the sub-pixel rendering artifact.

- 2026-01-21T11:20:51Z @tobiu closed this issue

