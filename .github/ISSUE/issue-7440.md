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
closedAt: '2025-11-04T19:26:04Z'
---
# Convert Component Test component/Base.mjs to Playwright

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7435 - Create Component Tests in Playwright (and migrate existing tests from Siesta)

---

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to migrate the component test for `component/Base.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/component/Base.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/component/Base.mjs`).
4.  Ensure the new test runs successfully via the component test runner.

## Comments

### @harikrishna-au - 2025-10-13 02:07

@tobiu please assign

### @tobiu - 2025-10-13 10:06

assigned. please read my comment on your other assigned sub for cmp based testing first.

