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
blockedBy: []
blocking: []
closedAt: '2025-11-04T19:30:51Z'
---
# Convert Component Test component/DateSelector.mjs to Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `component/DateSelector.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/component/DateSelector.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/component/DateSelector.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Timeline

- 2025-10-10T16:53:30Z @tobiu added the `enhancement` label
- 2025-10-10T16:53:30Z @tobiu added the `help wanted` label
- 2025-10-10T16:53:30Z @tobiu added parent issue #7435
- 2025-10-10T16:53:31Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:53:31Z @tobiu added the `ai` label
### @Mahita07 - 2025-10-11T11:32:25Z

@tobiu could you please assign this issue to me ?

### @tobiu - 2025-10-11T11:48:04Z

Sure, for this one you should sync with @Aki-07, since he is working on the harness. Before the harness is completed, you can not start. If you want to work on something else right away, you could e.g. create a couple new unit testing subs.

Spontaneous ideas (each file would need its own ticket):

    -   `Neo.util.Array`
    -   `Neo.util.String`
    -   `Neo.util.Date`
    -   `Neo.util.Matrix`

- 2025-10-11T11:48:14Z @tobiu assigned to @Mahita07
- 2025-11-04T19:30:13Z @tobiu unassigned from @Mahita07
- 2025-11-04T19:30:13Z @tobiu assigned to @tobiu
- 2025-11-04T19:30:39Z @tobiu referenced in commit `a7b185b` - "Convert Component Test component/DateSelector.mjs to Playwright #7441"
- 2025-11-04T19:30:51Z @tobiu closed this issue

