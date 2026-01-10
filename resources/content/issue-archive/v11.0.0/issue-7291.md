---
id: 7291
title: Convert vdom/VdomAsymmetricUpdates.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - KURO-1125
createdAt: '2025-09-27T14:05:14Z'
updatedAt: '2025-10-04T13:46:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7291'
author: tobiu
commentsCount: 3
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-04T13:46:14Z'
---
# Convert vdom/VdomAsymmetricUpdates.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `vdom/VdomAsymmetricUpdates.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/vdom/VdomAsymmetricUpdates.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/vdom/VdomAsymmetricUpdates.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27 @tobiu added the `enhancement` label
- 2025-09-27 @tobiu added parent issue #7262
- 2025-10-02 @tobiu added the `help wanted` label
- 2025-10-02 @tobiu added the `good first issue` label
- 2025-10-02 @tobiu added the `hacktoberfest` label
### @KURO-1125 - 2025-10-03 09:23

Hi! I'd like to work on this VdomAsymmetricUpdates test migration using the AI native workflow.
Could you please assign this to me?
Thanks!

- 2025-10-03 @tobiu assigned to @KURO-1125
### @tobiu - 2025-10-03 16:07

done.

- 2025-10-04 @KURO-1125 cross-referenced by PR #7348
### @KURO-1125 - 2025-10-04 09:54

Hi! All 4 assigned migrations are now complete:

state/Provider - PR created
vdom/Advanced - PR created  
vdom/VdomAsymmetricUpdates - PR created
vdom/VdomRealWorldUpdates - PR created

All migrations used the AI native workflow and are ready for review.

Thanks!


- 2025-10-04 @tobiu closed this issue
- 2025-10-04 @tobiu referenced in commit `46eb4b9` - "#7291 internal ticket update"

