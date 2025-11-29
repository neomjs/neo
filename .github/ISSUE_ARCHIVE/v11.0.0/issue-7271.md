---
id: 7271
title: Convert Rectangle.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - tobiu
createdAt: '2025-09-27T12:40:54Z'
updatedAt: '2025-11-04T10:55:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7271'
author: tobiu
commentsCount: 2
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T10:55:27Z'
---
# Convert Rectangle.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `Rectangle.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/Rectangle.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/Rectangle.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-04 12:15

hello @tobiu  I would like to work on this , can you please assign it to me??

### @tobiu - 2025-10-07 19:21

oh, missed your comment. hint for this one: the Rectangle class extend DOMRect, which is not available inside node.

so, there is a mock for it inside: `test/playwright/setup.mjs`

## Activity Log

- 2025-09-27 @tobiu added the `enhancement` label
- 2025-10-03 @tobiu added the `help wanted` label
- 2025-10-03 @tobiu added the `good first issue` label
- 2025-10-03 @tobiu added the `hacktoberfest` label
- 2025-10-07 @tobiu assigned to @kart-u
- 2025-11-04 @tobiu unassigned from @kart-u
- 2025-11-04 @tobiu assigned to @tobiu
- 2025-11-04 @tobiu referenced in commit `4a1c81b` - "Convert Rectangle.mjs Test from Siesta to Playwright #7271"
- 2025-11-04 @tobiu closed this issue

