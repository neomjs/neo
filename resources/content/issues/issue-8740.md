---
id: 8740
title: Refactor Portal Header Toolbar for Dark Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T23:15:13Z'
updatedAt: '2026-01-16T23:17:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8740'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T23:17:26Z'
---
# Refactor Portal Header Toolbar for Dark Theme

Refactor `resources/scss/src/apps/portal/HeaderToolbar.scss` to support theming.

Tasks:
1. Extract `box-shadow` (used in `.portal-header-toolbar` and `.separate-bar`) to `--portal-header-shadow`.
2. Define light theme value: `0 5px 10px rgba(0,0,0,.3)`.
3. Define dark theme value: `0 5px 10px rgba(0,0,0,.5)`.
4. Check for any other hardcoded colors.

This ticket is a child of Epic #8727.

## Timeline

- 2026-01-16T23:15:14Z @tobiu added the `enhancement` label
- 2026-01-16T23:15:14Z @tobiu added the `design` label
- 2026-01-16T23:15:14Z @tobiu added the `ai` label
- 2026-01-16T23:15:37Z @tobiu added parent issue #8727
- 2026-01-16T23:17:07Z @tobiu referenced in commit `825811e` - "refactor: Refactor Portal Header Toolbar for Dark Theme (#8740)"
### @tobiu - 2026-01-16T23:17:15Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete. Extracted `box-shadow` to `--portal-header-shadow` and created theme files for light and dark modes.

- 2026-01-16T23:17:22Z @tobiu assigned to @tobiu
- 2026-01-16T23:17:26Z @tobiu closed this issue
- 2026-01-16T23:28:38Z @tobiu cross-referenced by #8738

