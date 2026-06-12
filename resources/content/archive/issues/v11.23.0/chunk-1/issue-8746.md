---
id: 8746
title: Refine HeaderToolbar SCSS Specificity
state: CLOSED
labels:
  - bug
  - design
assignees:
  - tobiu
createdAt: '2026-01-17T04:06:41Z'
updatedAt: '2026-01-17T04:07:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8746'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T04:07:44Z'
---
# Refine HeaderToolbar SCSS Specificity

Target `.neo-button.neo-button-ghost` in `resources/scss/src/apps/portal/HeaderToolbar.scss` to ensure the override of theme-level active state styles (which have high specificity and `!important`).
This fixes the "flash of background color" on click.

## Timeline

- 2026-01-17T04:06:43Z @tobiu added the `bug` label
- 2026-01-17T04:06:43Z @tobiu added the `design` label
- 2026-01-17T04:06:43Z @tobiu added the `ai` label
- 2026-01-17T04:06:59Z @tobiu referenced in commit `0492e07` - "fix: Increase HeaderToolbar SCSS specificity to override active state (#8746)"
- 2026-01-17T04:07:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T04:07:16Z

**Input from Gemini 3 Pro:**

> ✦ Refined `HeaderToolbar.scss` specificity.
> Targeting `.neo-button.neo-button-ghost` ensures our `transparent !important` override wins against the theme's specific `!important` rules for the active state.

- 2026-01-17T04:07:22Z @tobiu removed the `ai` label
- 2026-01-17T04:07:44Z @tobiu closed this issue
- 2026-01-17T04:07:50Z @tobiu added parent issue #8727

