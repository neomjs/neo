---
id: 7585
title: 'Implement Missing #checkGhAuth Method in HealthService'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:50:48Z'
updatedAt: '2025-10-20T13:56:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7585'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T13:56:39Z'
---
# Implement Missing #checkGhAuth Method in HealthService

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

A code review revealed that the `HealthService.healthcheck` method calls a private method, `#checkGhAuth()`, which does not exist in the file. This is a critical bug that causes the health check to fail and prevents the server from starting.

This ticket covers the implementation of the missing authentication check.

## Acceptance Criteria

1.  A new private method, `#checkGhAuth()`, is implemented in `HealthService.mjs`.
2.  The method executes the `gh auth status` command.
3.  It correctly parses the output of the command to determine if the user is authenticated with `github.com`.
4.  It returns an object with the shape `{ authenticated: boolean, error?: string }`.
    - `authenticated` should be `true` if login is successful, `false` otherwise.
    - `error` should contain an informative message if authentication fails.

