---
id: 7267
title: Convert ClassConfigsAndFields.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T12:33:56Z'
updatedAt: '2025-10-03T16:19:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7267'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-27T15:11:22Z'
---
# Convert ClassConfigsAndFields.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `ClassConfigsAndFields.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/ClassConfigsAndFields.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/ClassConfigsAndFields.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T12:33:57Z @tobiu added the `enhancement` label
- 2025-09-27T12:33:57Z @tobiu added parent issue #7262
- 2025-09-27T15:06:35Z @tobiu referenced in commit `b0c8db3` - "Convert ClassConfigsAndFields.mjs Test from Siesta to Playwright #7267"
- 2025-09-27T15:10:57Z @tobiu referenced in commit `0e24f62` - "#7267 intent driven comments, ticket updates"
- 2025-09-27T15:11:22Z @tobiu closed this issue
- 2025-10-03T16:19:37Z @tobiu assigned to @tobiu

