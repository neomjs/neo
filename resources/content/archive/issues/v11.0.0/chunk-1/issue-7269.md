---
id: 7269
title: Convert CollectionBase.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T12:37:41Z'
updatedAt: '2025-09-30T10:59:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7269'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-30T10:59:09Z'
---
# Convert CollectionBase.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `CollectionBase.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/CollectionBase.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/CollectionBase.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T12:37:42Z @tobiu added parent issue #7262
- 2025-09-27T12:37:42Z @tobiu added the `enhancement` label
- 2025-09-30T10:58:31Z @tobiu assigned to @tobiu
- 2025-09-30T10:58:57Z @tobiu referenced in commit `3dd728e` - "Convert CollectionBase.mjs Test from Siesta to Playwright #7269"
- 2025-09-30T10:59:09Z @tobiu closed this issue

