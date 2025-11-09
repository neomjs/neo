---
id: 7441
title: Convert Component Test component/DateSelector.mjs to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:53:29Z'
updatedAt: '2025-11-04T19:30:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7441'
author: tobiu
commentsCount: 2
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-04T19:30:51Z'
---
# Convert Component Test component/DateSelector.mjs to Playwright

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7435 - Create Component Tests in Playwright (and migrate existing tests from Siesta)

---

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `component/DateSelector.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/component/DateSelector.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/component/DateSelector.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Comments

### @Mahita07 - 2025-10-11 11:32

@tobiu could you please assign this issue to me ?

### @tobiu - 2025-10-11 11:48

Sure, for this one you should sync with @Aki-07, since he is working on the harness. Before the harness is completed, you can not start. If you want to work on something else right away, you could e.g. create a couple new unit testing subs.

Spontaneous ideas (each file would need its own ticket):

    -   `Neo.util.Array`
    -   `Neo.util.String`
    -   `Neo.util.Date`
    -   `Neo.util.Matrix`

