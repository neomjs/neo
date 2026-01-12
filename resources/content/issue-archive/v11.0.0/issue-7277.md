---
id: 7277
title: Convert config/Hierarchy.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - tobiu
createdAt: '2025-09-27T13:36:15Z'
updatedAt: '2025-10-07T19:24:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7277'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-30T12:44:59Z'
---
# Convert config/Hierarchy.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `config/Hierarchy.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/Hierarchy.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/Hierarchy.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:36:16Z @tobiu added the `enhancement` label
- 2025-09-27T13:36:16Z @tobiu added parent issue #7262
- 2025-09-30T12:44:43Z @tobiu referenced in commit `ebc49d2` - "Convert config/Hierarchy.mjs Test from Siesta to Playwright #7277"
- 2025-09-30T12:45:00Z @tobiu closed this issue
- 2025-10-03T16:18:11Z @tobiu added the `help wanted` label
- 2025-10-03T16:18:11Z @tobiu added the `good first issue` label
- 2025-10-03T16:18:11Z @tobiu added the `hacktoberfest` label
- 2025-10-07T19:24:35Z @tobiu assigned to @tobiu

