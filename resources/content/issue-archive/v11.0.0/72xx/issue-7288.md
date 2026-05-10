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
blockedBy: []
blocking: []
closedAt: '2025-10-04T13:40:22Z'
---
# Convert state/Provider.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `state/Provider.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/state/Provider.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/state/Provider.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T14:01:28Z @tobiu added the `enhancement` label
- 2025-09-27T14:01:28Z @tobiu added parent issue #7262
- 2025-10-02T19:23:24Z @tobiu added the `help wanted` label
- 2025-10-02T19:23:24Z @tobiu added the `good first issue` label
- 2025-10-02T19:23:24Z @tobiu added the `hacktoberfest` label
### @KURO-1125 - 2025-10-03T09:37:42Z

Hi! I'd like to work on this Provider test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

- 2025-10-03T16:14:19Z @tobiu assigned to @KURO-1125
### @tobiu - 2025-10-03T16:14:24Z

done.

### @KURO-1125 - 2025-10-03T20:08:56Z

Hi! Completed two more migrations using the AI workflow:

state/Provider - PR created
vdom/Advanced - PR created

Working on the remaining 2 assigned migrations next.

Thanks!


- 2025-10-03T20:09:39Z @KURO-1125 cross-referenced by PR #7340
- 2025-10-04T13:40:22Z @tobiu closed this issue
- 2025-10-04T13:43:03Z @tobiu referenced in commit `d590d34` - "#7288 internal ticket update"

