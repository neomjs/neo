---
id: 7268
title: Convert ClassSystem.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T12:36:16Z'
updatedAt: '2025-10-03T16:19:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7268'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-27T18:15:07Z'
---
# Convert ClassSystem.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `ClassSystem.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/ClassSystem.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/ClassSystem.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T12:36:17Z @tobiu added the `enhancement` label
- 2025-09-27T12:36:17Z @tobiu added parent issue #7262
- 2025-09-27T18:14:49Z @tobiu referenced in commit `e26fa34` - "Convert ClassSystem.mjs Test from Siesta to Playwright #7268"
- 2025-09-27T18:15:07Z @tobiu closed this issue
- 2025-10-03T16:19:47Z @tobiu assigned to @tobiu

