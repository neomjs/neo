---
id: 9212
title: 'DevIndex: Create HeaderToolbar Theme Files'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-20T08:08:58Z'
updatedAt: '2026-02-20T08:19:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9212'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-20T08:19:24Z'
---
# DevIndex: Create HeaderToolbar Theme Files

We are polishing the top-level app styling for the DevIndex application.
This task involves creating dedicated theme files for the `HeaderToolbar` component in both `neo-dark` and `neo-light` themes.

Scope:
- Create `resources/scss/theme-neo-dark/apps/devindex/HeaderToolbar.scss`
- Create `resources/scss/theme-neo-light/apps/devindex/HeaderToolbar.scss`
- Rename CSS variables from `--portal-header-shadow` to `--devindex-header-shadow` in `resources/scss/src/apps/devindex/HeaderToolbar.scss`


## Timeline

- 2026-02-20T08:08:59Z @tobiu added the `enhancement` label
- 2026-02-20T08:09:00Z @tobiu added the `ai` label
- 2026-02-20T08:18:04Z @tobiu referenced in commit `0803a8f` - "feat(devindex): Create HeaderToolbar theme files and decouple styling (#9212)"
### @tobiu - 2026-02-20T08:18:12Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the task.
> - Created `resources/scss/theme-neo-dark/apps/devindex/HeaderToolbar.scss`
> - Created `resources/scss/theme-neo-light/apps/devindex/HeaderToolbar.scss`
> - Updated `resources/scss/src/apps/devindex/HeaderToolbar.scss` to use the new `--devindex-header-shadow` variable and removed the unused `.portal-home-maincontainer` rule block.
> - Pushed the changes to `dev`.

- 2026-02-20T08:19:11Z @tobiu assigned to @tobiu
- 2026-02-20T08:19:24Z @tobiu closed this issue

