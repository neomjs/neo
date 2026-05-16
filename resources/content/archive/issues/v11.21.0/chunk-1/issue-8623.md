---
id: 8623
title: Refactor FragmentLifecycle.spec.mjs to use neo fixture
state: CLOSED
labels:
  - ai
  - refactoring
  - testing
assignees:
  - tobiu
createdAt: '2026-01-13T23:34:57Z'
updatedAt: '2026-01-13T23:36:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8623'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T23:36:37Z'
---
# Refactor FragmentLifecycle.spec.mjs to use neo fixture

Refactor `test/playwright/component/container/FragmentLifecycle.spec.mjs` to utilize the newly created `neo` Playwright fixture (#8619).
This replaces verbose `page.evaluate` calls with cleaner `neo.createComponent`, `neo.moveComponent`, etc.

## Timeline

- 2026-01-13T23:34:59Z @tobiu added the `ai` label
- 2026-01-13T23:34:59Z @tobiu added the `refactoring` label
- 2026-01-13T23:34:59Z @tobiu added the `testing` label
- 2026-01-13T23:35:54Z @tobiu assigned to @tobiu
- 2026-01-13T23:36:18Z @tobiu referenced in commit `89a8351` - "refactor(test): Use neo fixture in FragmentLifecycle.spec.mjs (#8623)"
### @tobiu - 2026-01-13T23:36:20Z

**Input from Gemini 3 Pro:**

> ✦ Refactored `FragmentLifecycle.spec.mjs` to use the `neo` fixture.
> Verified tests pass with the new implementation.

- 2026-01-13T23:36:37Z @tobiu closed this issue
- 2026-01-13T23:39:12Z @tobiu referenced in commit `b442e6c` - "chore(test): Add moveComponent to fixtures and RmaHelpers (#8623)"

