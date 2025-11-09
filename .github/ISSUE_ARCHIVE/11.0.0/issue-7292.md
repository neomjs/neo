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
closedAt: '2025-10-04T14:15:07Z'
---
# Convert vdom/VdomRealWorldUpdates.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `vdom/VdomRealWorldUpdates.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/VdomRealWorldUpdates.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/VdomRealWorldUpdates.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @KURO-1125 - 2025-10-03 09:22

Hi! I'd like to work on this VdomReadWorldUpdates test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

### @tobiu - 2025-10-03 16:06

done.

### @tobiu - 2025-10-04 18:34

reopening something is odd with the imports / class definitions, getting errors when running all new tests combined.

### @tobiu - 2025-10-04 18:36

i think we are stable again => 114 tests are passing.

### @KURO-1125 - 2025-10-04 19:10

Thanks for the fix! Good to see all 114 test are passing.

