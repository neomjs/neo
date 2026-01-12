---
id: 7284
title: Convert functional/Parse5Processor.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - kart-u
createdAt: '2025-09-27T13:56:24Z'
updatedAt: '2025-10-04T17:52:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7284'
author: tobiu
commentsCount: 2
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T17:52:12Z'
---
# Convert functional/Parse5Processor.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `functional/Parse5Processor.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/functional/Parse5Processor.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/functional/Parse5Processor.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:56:25Z @tobiu added the `enhancement` label
- 2025-09-27T13:56:25Z @tobiu added parent issue #7262
- 2025-10-02T19:24:38Z @tobiu added the `help wanted` label
- 2025-10-02T19:24:38Z @tobiu added the `good first issue` label
- 2025-10-02T19:24:38Z @tobiu added the `hacktoberfest` label
### @kart-u - 2025-10-04T09:00:15Z

hello @tobiu I would like to work on this can you please assign it to me?

- 2025-10-04T09:21:51Z @tobiu assigned to @kart-u
### @tobiu - 2025-10-04T09:21:57Z

done.

- 2025-10-04T11:30:34Z @kart-u referenced in commit `4eb6e3f` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T11:32:22Z @kart-u cross-referenced by PR #7353
- 2025-10-04T12:23:03Z @kart-u cross-referenced by #7286
- 2025-10-04T15:47:00Z @kart-u referenced in commit `34de2c3` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:02:25Z @kart-u referenced in commit `903c27c` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:32:43Z @kart-u referenced in commit `50246b6` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:52:12Z @tobiu closed this issue
- 2025-10-04T17:52:13Z @tobiu referenced in commit `7887dbe` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:52:13Z @tobiu referenced in commit `f73c1b8` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:52:13Z @tobiu referenced in commit `b5ec37e` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:52:13Z @tobiu referenced in commit `30f0198` - "Convert functional/Parse5Processor.mjs Test from Siesta to Playwright #7284"
- 2025-10-04T17:56:57Z @tobiu referenced in commit `924eaf1` - "#7284 ticket md file update"

