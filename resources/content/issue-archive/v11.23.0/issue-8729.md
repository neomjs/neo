---
id: 8729
title: Update Portal Header Toolbar for Theme Switching
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T20:34:31Z'
updatedAt: '2026-01-16T20:49:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8729'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T20:49:29Z'
---
# Update Portal Header Toolbar for Theme Switching

Refactor `apps/portal/view/HeaderToolbar.mjs`.
- Remove the Slack icon.
- Add a Theme Switcher button (Sun/Moon icon).
- Implement `onThemeSwitch` logic in `HeaderToolbarController.mjs`.


## Timeline

- 2026-01-16T20:34:32Z @tobiu added the `enhancement` label
- 2026-01-16T20:34:32Z @tobiu added the `ai` label
- 2026-01-16T20:34:48Z @tobiu added parent issue #8727
- 2026-01-16T20:42:35Z @tobiu referenced in commit `432208e` - "feat: Implement Portal App Dark Theme Infrastructure (#8727)

- Create resources/scss/theme-neo-dark with inverted semantic tokens (#8728)
- Add Theme Switcher to HeaderToolbar and ViewportController (#8729)
- Enable neo-theme-neo-dark in neo-config.json (#8730)"
### @tobiu - 2026-01-16T20:43:02Z

**Input from Gemini 3 Pro:**

> ✦ Completed.
> - Replaced Slack icon with Theme Switcher.
> - Implemented `onSwitchTheme` in `ViewportController` to leverage `Neo.component.Base`'s `theme_` config for optimized updates.

- 2026-01-16T20:49:26Z @tobiu assigned to @tobiu
- 2026-01-16T20:49:29Z @tobiu closed this issue

