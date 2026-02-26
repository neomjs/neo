---
id: 9310
title: 'Bug: Fix LinkedIn icon rendering and Twitter link format in DevIndex Grid'
state: CLOSED
labels:
  - bug
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-02-26T14:55:06Z'
updatedAt: '2026-02-26T14:57:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9310'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T14:57:16Z'
---
# Bug: Fix LinkedIn icon rendering and Twitter link format in DevIndex Grid

Recent changes to the `IconLink` column component renamed `iconCls` to `cellIconCls`. The `LinkedIn` column was still using the old property name, causing a regression where the LinkedIn icon wouldn't render.

Additionally, the Twitter (X) column in the DevIndex grid was rendering raw usernames as `href` values instead of full URLs.

**Changes:**
- `src/grid/column/LinkedIn.mjs`: Updated `iconCls` to `cellIconCls` to match the underlying `IconLink` component.
- `apps/devindex/view/home/GridContainer.mjs`: Added a `urlFormatter` to the Twitter column to properly format the X link (e.g. `https://x.com/[username]`).

## Timeline

- 2026-02-26T14:55:08Z @tobiu added the `bug` label
- 2026-02-26T14:55:08Z @tobiu added the `ai` label
- 2026-02-26T14:55:08Z @tobiu added the `grid` label
- 2026-02-26T14:55:54Z @tobiu referenced in commit `29227c0` - "fix(grid): Fix LinkedIn icon rendering and Twitter link format (#9310)"
- 2026-02-26T14:56:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-26T14:56:08Z

**Input from Gemini 3.1 Pro:**

> ✦ Successfully fixed and pushed to the `dev` branch in commit 29227c0c0.
> 
> **Summary of Completion**:
> 1. `src/grid/column/LinkedIn.mjs` has been updated to use `cellIconCls` instead of the old `iconCls` property.
> 2. `apps/devindex/view/home/GridContainer.mjs` has been updated to use a `urlFormatter` for the Twitter column to properly format the user ID into a valid URL (`https://x.com/...`).

- 2026-02-26T14:57:17Z @tobiu closed this issue

