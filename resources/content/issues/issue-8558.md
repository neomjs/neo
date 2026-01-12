---
id: 8558
title: 'Fix: Anchor route regex to prevent unintended prefix matching'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-11T18:46:51Z'
updatedAt: '2026-01-11T18:52:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8558'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T18:52:15Z'
---
# Fix: Anchor route regex to prevent unintended prefix matching

The current route matching logic in `Neo.controller.Base` uses unanchored regular expressions. This causes routes like `/news` to match `/news/tickets/8470`, leading to incorrect controller activation.

**Solution:**
Modify `Neo.controller.Base.afterSetRoutes` to anchor the generated regular expressions with `^` (start) and `$` (end).

- `/news` -> `/^\/news$/`
- `/news/releases/{*itemId}` -> `/^\/news\/releases\/(.*)$/`

This ensures precise route matching.

## Timeline

- 2026-01-11T18:46:52Z @tobiu added the `bug` label
- 2026-01-11T18:46:52Z @tobiu added the `ai` label
- 2026-01-11T18:46:52Z @tobiu added the `core` label
- 2026-01-11T18:51:28Z @tobiu referenced in commit `f2dfe29` - "fix: Anchor route regex to prevent unintended prefix matching (#8558)"
- 2026-01-11T18:51:42Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T18:51:52Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `src/controller/Base.mjs` to anchor the generated route regexes with `^` and `$`.
> This ensures that routes like `/news` will no longer match supersets like `/news/tickets/123`.
> 
> I also removed the temporary debug logs and workarounds in `apps/portal/view/news/release/MainContainerController.mjs`.

- 2026-01-11T18:52:15Z @tobiu closed this issue

