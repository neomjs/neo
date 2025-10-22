---
id: 7288
title: Convert state/Provider.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T14:01:27Z'
updatedAt: '2025-10-04T13:40:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7288'
author: tobiu
commentsCount: 3
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-04T13:40:22Z'
---
# Convert state/Provider.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `state/Provider.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/Provider.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/Provider.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @KURO-1125 - 2025-10-03 09:37

Hi! I'd like to work on this Provider test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

### @tobiu - 2025-10-03 16:14

done.

### @KURO-1125 - 2025-10-03 20:08

Hi! Completed two more migrations using the AI workflow:

state/Provider - PR created
vdom/Advanced - PR created

Working on the remaining 2 assigned migrations next.

Thanks!


