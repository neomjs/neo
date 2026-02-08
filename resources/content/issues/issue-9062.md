---
id: 9062
title: 'Fix: Cleanup Service incompatible with minified schema'
state: CLOSED
labels:
  - bug
  - ai
  - regression
assignees:
  - tobiu
createdAt: '2026-02-08T23:00:28Z'
updatedAt: '2026-02-08T23:11:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9062'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-08T23:11:26Z'
---
# Fix: Cleanup Service incompatible with minified schema

The `DevRank.services.Cleanup` service is failing because it has not been updated to support the new minified data schema introduced in #9059.

**Error:**
`TypeError: Cannot read properties of undefined (reading 'toLowerCase')` at `Cleanup.mjs:86`.

**Cause:**
The service is attempting to access legacy property names (e.g., `login`, `total_contributions`) which have been renamed to short keys (e.g., `l`, `tc`) in `users.json`.

**Task:**
Refactor `apps/devrank/services/Cleanup.mjs` to use the minified schema keys for all data operations (sorting, filtering, whitelisting).

## Timeline

- 2026-02-08T23:00:29Z @tobiu added the `bug` label
- 2026-02-08T23:00:29Z @tobiu added the `ai` label
- 2026-02-08T23:00:29Z @tobiu added the `regression` label
- 2026-02-08T23:00:34Z @tobiu assigned to @tobiu
- 2026-02-08T23:00:43Z @tobiu added parent issue #8930
- 2026-02-08T23:01:41Z @tobiu referenced in commit `d1c39bf` - "fix: Cleanup Service incompatible with minified schema (#9062)"
- 2026-02-08T23:11:26Z @tobiu closed this issue

