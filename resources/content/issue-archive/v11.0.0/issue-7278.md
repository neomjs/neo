---
id: 7278
title: Convert config/MemoryLeak.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T13:37:46Z'
updatedAt: '2025-10-07T19:24:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7278'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-30T12:57:08Z'
---
# Convert config/MemoryLeak.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `config/MemoryLeak.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/MemoryLeak.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/MemoryLeak.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:37:47Z @tobiu added the `enhancement` label
- 2025-09-27T13:37:48Z @tobiu added parent issue #7262
- 2025-09-30T12:56:43Z @tobiu referenced in commit `c4b9506` - "Convert config/MemoryLeak.mjs Test from Siesta to Playwright #7278"
- 2025-09-30T12:57:08Z @tobiu closed this issue
- 2025-10-07T19:24:45Z @tobiu assigned to @tobiu

