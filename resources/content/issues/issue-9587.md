---
id: 9587
title: Update `updateNeoVersion.mjs` to preserve framework magic comments
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-27T20:20:46Z'
updatedAt: '2026-03-27T20:26:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9587'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-27T20:24:25Z'
---
# Update `updateNeoVersion.mjs` to preserve framework magic comments

Removing legacy magic comment replacement logic from `updateNeoVersion.mjs` in the `pages` repository because `webpackExclude` magic comments are now correctly embedded in the Neo framework workers on the `neo` level.

- Removed Step 6 (`App.mjs`)
- Removed Step 6.1 (`Canvas.mjs`)
- Removed Step 6.2 (`Task.mjs`)

`Data.mjs` is also naturally preserved since it was never manipulated by the script.

## Timeline

- 2026-03-27T20:20:47Z @tobiu added the `enhancement` label
- 2026-03-27T20:20:48Z @tobiu added the `ai` label
### @tobiu - 2026-03-27T20:24:25Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ The changes to `updateNeoVersion.mjs` have been successfully pushed to the `pages` repository's `main` branch. This preserves the new `webpackExclude` magic comments located in `App.mjs`, `Canvas.mjs`, `Task.mjs`, and `Data.mjs` untouched during GitHub Pages builds.

- 2026-03-27T20:24:25Z @tobiu closed this issue
- 2026-03-27T20:24:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-27T20:26:14Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Commit in the `pages` repository: https://github.com/neomjs/pages/commit/01d4b58c143044c1cd4e1ded9e15d250c89a5175


