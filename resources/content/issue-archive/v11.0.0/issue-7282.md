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

## Timeline

- 2025-09-27T13:54:08Z @tobiu added the `enhancement` label
- 2025-09-27T13:54:09Z @tobiu added parent issue #7262
- 2025-10-07T19:26:58Z @tobiu added the `help wanted` label
- 2025-10-07T19:26:58Z @tobiu added the `good first issue` label
- 2025-10-07T19:26:58Z @tobiu added the `hacktoberfest` label
### @nabeel001 - 2025-10-08T03:25:00Z

Hi @tobiu 
I would like to work on this issue, Kindly assign this to me.

### @tobiu - 2025-10-08T09:34:16Z

Thx! make sure to point AI to the epic too, since it contains valuable hints: `.github/ISSUE/epic-enhance-workflow-with-mandatory-unit-testing.md`

- 2025-10-08T09:34:22Z @tobiu assigned to @nabeel001
- 2025-10-09T04:29:25Z @nabeel001 cross-referenced by PR #7423
### @nabeel001 - 2025-10-09T04:30:21Z

Hi @tobiu 
I have migrated the functional/Button.mjs to playwright. Kindly review and merge the PR.

- 2025-10-09T18:19:35Z @tobiu closed this issue

