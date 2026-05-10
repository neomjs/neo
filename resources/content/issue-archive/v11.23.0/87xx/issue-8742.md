---
id: 8742
title: Refactor Portal TabContainer for Dark Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T23:32:06Z'
updatedAt: '2026-01-16T23:34:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8742'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T23:34:07Z'
---
# Refactor Portal TabContainer for Dark Theme

Refactor `resources/scss/src/apps/portal/shared/TabContainer.scss` to support theming.

**Tasks**:
1.  Extract hardcoded colors (`#3E63DD`, `#8BA6FF`, `#fff`) to CSS variables.
    *   Examples: `--portal-tab-indicator-bg`, `--portal-tab-toolbar-bg`, `--portal-tab-text-color`, `--portal-tab-text-color-pressed`.
2.  **Light Theme**: Map variables to original hex values.
3.  **Dark Theme**: Map variables to semantic tokens (e.g., `var(--sem-color-bg-primary-default)`).

This ticket is a child of Epic #8727.

## Timeline

- 2026-01-16T23:32:08Z @tobiu added the `enhancement` label
- 2026-01-16T23:32:08Z @tobiu added the `design` label
- 2026-01-16T23:32:08Z @tobiu added the `ai` label
- 2026-01-16T23:32:17Z @tobiu added parent issue #8727
- 2026-01-16T23:33:51Z @tobiu referenced in commit `59b0178` - "refactor: Dark Theme for Portal TabContainer (#8742)"
### @tobiu - 2026-01-16T23:33:59Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring of `TabContainer.scss` complete.
> - Extracted colors to `--portal-tab-*` variables.
> - Mapped light theme to original hex values.
> - Mapped dark theme to semantic tokens (`primary` for indicators/buttons).

- 2026-01-16T23:34:05Z @tobiu assigned to @tobiu
- 2026-01-16T23:34:07Z @tobiu closed this issue

