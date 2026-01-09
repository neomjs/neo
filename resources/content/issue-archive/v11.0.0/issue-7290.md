---
id: 7290
title: Convert vdom/Advanced.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T14:04:18Z'
updatedAt: '2025-10-04T13:30:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7290'
author: tobiu
commentsCount: 2
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T13:30:58Z'
---
# Convert vdom/Advanced.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `vdom/Advanced.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/Advanced.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/Advanced.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @KURO-1125 - 2025-10-03 09:24

Hi! I'd like to work on this Advanced test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

### @tobiu - 2025-10-03 16:07

done.

## Activity Log

- 2025-09-27 @tobiu added parent issue #7262
- 2025-09-27 @tobiu added the `enhancement` label
- 2025-10-02 @tobiu added the `help wanted` label
- 2025-10-02 @tobiu added the `good first issue` label
- 2025-10-02 @tobiu added the `hacktoberfest` label
- 2025-10-03 @tobiu assigned to @KURO-1125
- 2025-10-03 @KURO-1125 cross-referenced by PR #7339
- 2025-10-04 @tobiu closed this issue
- 2025-10-04 @tobiu referenced in commit `0172609` - "#7290 asignee, ticket status, removed ticket duplicate"

