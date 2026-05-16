---
id: 8610
title: Fix crash in Container insert when layout is null
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-13T18:37:39Z'
updatedAt: '2026-01-13T18:38:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8610'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T18:38:11Z'
---
# Fix crash in Container insert when layout is null

Fixes a `TypeError: Cannot read properties of null (reading 'applyChildAttributes')` in `Neo.container.Base.insert`.
This occurs when a container (like `Neo.container.Fragment`) explicitly sets `layout: null` but `insert` attempts to call `me.layout.applyChildAttributes`.

**Fix:** Use optional chaining `me.layout?.applyChildAttributes(...)`.

## Timeline

- 2026-01-13T18:37:40Z @tobiu added the `bug` label
- 2026-01-13T18:37:40Z @tobiu added the `ai` label
- 2026-01-13T18:37:41Z @tobiu added the `core` label
### @tobiu - 2026-01-13T18:37:59Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the crash by using optional chaining `me.layout?.applyChildAttributes(...)`. Verified via component tests that `moveComponent` no longer throws this error.

- 2026-01-13T18:38:12Z @tobiu closed this issue
- 2026-01-13T18:38:34Z @tobiu assigned to @tobiu
- 2026-01-13T18:38:45Z @tobiu referenced in commit `21fe331` - "fix: Use optional chaining for layout access in Container.insert (#8610)"

