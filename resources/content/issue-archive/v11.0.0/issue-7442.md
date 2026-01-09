---
id: 7442
title: Convert Component Test form/field/ComboBox.mjs to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:54:51Z'
updatedAt: '2025-11-04T20:21:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7442'
author: tobiu
commentsCount: 2
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T20:21:51Z'
---
# Convert Component Test form/field/ComboBox.mjs to Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `form/field/ComboBox.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/form/field/ComboBox.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/form/field/ComboBox.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Comments

### @Mahita07 - 2025-10-11 11:33

@tobiu Could you please assign this issue to me ?

### @tobiu - 2025-10-11 11:51

sure. same as for the other sub: requires phase 1 to be completed. i think the combobox is quite complex, and assume that the siesta test currently fails. so my recommendation: we can migrate the tests as they are first, but then need a follow-up ticket to ensure that all pass (we need to evaluate if there are framework issues, or if logic changes just require to adjust test conditions).

## Activity Log

- 2025-10-10 @tobiu added parent issue #7435
- 2025-10-10 @tobiu added the `enhancement` label
- 2025-10-10 @tobiu added the `help wanted` label
- 2025-10-10 @tobiu added the `hacktoberfest` label
- 2025-10-10 @tobiu added the `ai` label
- 2025-10-11 @tobiu assigned to @Mahita07
- 2025-11-04 @tobiu unassigned from @Mahita07
- 2025-11-04 @tobiu assigned to @tobiu
- 2025-11-04 @tobiu referenced in commit `317a94f` - "Convert Component Test form/field/ComboBox.mjs to Playwright #7442"
- 2025-11-04 @tobiu closed this issue

