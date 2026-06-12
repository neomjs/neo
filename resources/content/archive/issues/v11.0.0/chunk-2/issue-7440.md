---
id: 7440
title: Convert Component Test component/Base.mjs to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:51:58Z'
updatedAt: '2025-11-04T19:26:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7440'
author: tobiu
commentsCount: 2
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T19:26:04Z'
---
# Convert Component Test component/Base.mjs to Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `component/Base.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/component/Base.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/component/Base.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Timeline

- 2025-10-10T16:51:59Z @tobiu added parent issue #7435
- 2025-10-10T16:52:00Z @tobiu added the `enhancement` label
- 2025-10-10T16:52:00Z @tobiu added the `help wanted` label
- 2025-10-10T16:52:00Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:52:00Z @tobiu added the `ai` label
### @harikrishna-au - 2025-10-13T02:07:25Z

@tobiu please assign

- 2025-10-13T10:06:20Z @tobiu assigned to @harikrishna-au
### @tobiu - 2025-10-13T10:06:48Z

assigned. please read my comment on your other assigned sub for cmp based testing first.

- 2025-11-04T19:25:14Z @tobiu unassigned from @harikrishna-au
- 2025-11-04T19:25:14Z @tobiu assigned to @tobiu
- 2025-11-04T19:25:48Z @tobiu referenced in commit `f7d88f7` - "Convert Component Test component/Base.mjs to Playwright #7440"
- 2025-11-04T19:26:04Z @tobiu closed this issue

