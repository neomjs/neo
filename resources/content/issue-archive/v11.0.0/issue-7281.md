---
id: 7281
title: Convert form/field/AfterSetValueSequence.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T13:52:05Z'
updatedAt: '2025-10-07T19:25:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7281'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-01T18:27:02Z'
---
# Convert form/field/AfterSetValueSequence.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `form/field/AfterSetValueSequence.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/form/field/AfterSetValueSequence.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/form/field/AfterSetValueSequence.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:52:06Z @tobiu added the `enhancement` label
- 2025-09-27T13:52:06Z @tobiu added parent issue #7262
- 2025-10-01T18:26:55Z @tobiu referenced in commit `b01068c` - "Convert form/field/AfterSetValueSequence.mjs Test from Siesta to Playwright #7281"
- 2025-10-01T18:27:02Z @tobiu closed this issue
- 2025-10-07T19:25:00Z @tobiu assigned to @tobiu

