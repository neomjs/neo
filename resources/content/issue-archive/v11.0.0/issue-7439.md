---
id: 7439
title: Convert Component Test button/Base.mjs to Playwright
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:50:37Z'
updatedAt: '2025-10-27T13:06:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7439'
author: tobiu
commentsCount: 2
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T13:06:25Z'
---
# Convert Component Test button/Base.mjs to Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is to migrate the component test for `button/Base.mjs` from the Siesta test harness to the Playwright test runner. As the final step in Phase 1, this task will serve as the proof-of-concept that validates the new test harness.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/button/Base.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/button/Base.mjs`).
4.  Ensure the new test runs successfully using the new component test harness.

## Timeline

- 2025-10-10T16:50:39Z @tobiu added the `enhancement` label
- 2025-10-10T16:50:39Z @tobiu added the `help wanted` label
- 2025-10-10T16:50:39Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:50:39Z @tobiu added the `ai` label
- 2025-10-10T16:50:39Z @tobiu added parent issue #7435
- 2025-10-12T14:10:19Z @tobiu assigned to @tobiu
- 2025-10-12T14:10:24Z @tobiu removed the `help wanted` label
- 2025-10-12T14:10:24Z @tobiu removed the `hacktoberfest` label
- 2025-10-12T14:25:46Z @tobiu referenced in commit `c006ab9` - "Convert Component Test button/Base.mjs to Playwright #7439"
### @ad1tyayadav - 2025-10-27T13:03:45Z

/assign


### @tobiu - 2025-10-27T13:06:25Z

@ad1tyayadav this one is already done, forgot to close the ticket:
https://github.com/neomjs/neo/blob/dev/test/playwright/component/button/Base.spec.mjs

however, there are vast amounts of items that still either need unit or component based testing.

- 2025-10-27T13:06:25Z @tobiu closed this issue

