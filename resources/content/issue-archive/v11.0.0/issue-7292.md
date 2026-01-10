---
id: 7292
title: Convert vdom/VdomRealWorldUpdates.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T14:06:30Z'
updatedAt: '2025-10-04T19:10:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7292'
author: tobiu
commentsCount: 5
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T14:15:07Z'
---
# Convert vdom/VdomRealWorldUpdates.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `vdom/VdomRealWorldUpdates.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/VdomRealWorldUpdates.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/VdomRealWorldUpdates.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27 @tobiu added parent issue #7262
- 2025-09-27 @tobiu added the `enhancement` label
- 2025-10-02 @tobiu added the `help wanted` label
- 2025-10-02 @tobiu added the `good first issue` label
- 2025-10-02 @tobiu added the `hacktoberfest` label
### @KURO-1125 - 2025-10-03 09:22

Hi! I'd like to work on this VdomReadWorldUpdates test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

- 2025-10-03 @tobiu assigned to @KURO-1125
### @tobiu - 2025-10-03 16:06

done.

- 2025-10-04 @KURO-1125 cross-referenced by PR #7349
- 2025-10-04 @tobiu closed this issue
- 2025-10-04 @tobiu referenced in commit `250b7b7` - "#7292 internal ticket update"
### @tobiu - 2025-10-04 18:34

reopening something is odd with the imports / class definitions, getting errors when running all new tests combined.

- 2025-10-04 @tobiu referenced in commit `ca2f86c` - "#7292 imports / class re-assignment fix"
### @tobiu - 2025-10-04 18:36

i think we are stable again => 114 tests are passing.

### @KURO-1125 - 2025-10-04 19:10

Thanks for the fix! Good to see all 114 test are passing.


