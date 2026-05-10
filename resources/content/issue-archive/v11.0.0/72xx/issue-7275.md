---
id: 7275
title: Convert config/CircularDependencies.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T13:33:18Z'
updatedAt: '2025-09-30T11:29:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7275'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-30T11:29:03Z'
---
# Convert config/CircularDependencies.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `config/CircularDependencies.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/CircularDependencies.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/CircularDependencies.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:33:19Z @tobiu added the `enhancement` label
- 2025-09-27T13:33:19Z @tobiu added parent issue #7262
- 2025-09-30T11:28:07Z @tobiu assigned to @tobiu
- 2025-09-30T11:28:53Z @tobiu referenced in commit `6d98f4e` - "Convert config/CircularDependencies.mjs Test from Siesta to Playwright #7275"
- 2025-09-30T11:29:03Z @tobiu closed this issue

