---
id: 7282
title: Convert functional/Button.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - nabeel001
createdAt: '2025-09-27T13:54:07Z'
updatedAt: '2025-10-09T18:19:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7282'
author: tobiu
commentsCount: 3
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-09T18:19:35Z'
---
# Convert functional/Button.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `functional/Button.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/functional/Button.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/functional/Button.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @nabeel001 - 2025-10-08 03:25

Hi @tobiu 
I would like to work on this issue, Kindly assign this to me.

### @tobiu - 2025-10-08 09:34

Thx! make sure to point AI to the epic too, since it contains valuable hints: `.github/ISSUE/epic-enhance-workflow-with-mandatory-unit-testing.md`

### @nabeel001 - 2025-10-09 04:30

Hi @tobiu 
I have migrated the functional/Button.mjs to playwright. Kindly review and merge the PR.

## Activity Log

- 2025-09-27 @tobiu added the `enhancement` label
- 2025-10-07 @tobiu added the `help wanted` label
- 2025-10-07 @tobiu added the `good first issue` label
- 2025-10-07 @tobiu added the `hacktoberfest` label
- 2025-10-08 @tobiu assigned to @nabeel001
- 2025-10-09 @nabeel001 cross-referenced by PR #7423
- 2025-10-09 @tobiu closed this issue

