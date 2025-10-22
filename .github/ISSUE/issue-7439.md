---
id: 7439
title: Convert Component Test button/Base.mjs to Playwright
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-10T16:50:37Z'
updatedAt: '2025-10-12T14:10:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7439'
author: tobiu
commentsCount: 0
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Convert Component Test button/Base.mjs to Playwright

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7435 - Migrate Component Tests from Siesta to Playwright (R&D)

---

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns:
https://github.com/neomjs/neo/issues/7435

This task is to migrate the component test for `button/Base.mjs` from the Siesta test harness to the Playwright test runner. As the final step in Phase 1, this task will serve as the proof-of-concept that validates the new test harness.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/button/Base.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test must cover all the functionality of the original Siesta test (`test/components/files/button/Base.mjs`).
4.  Ensure the new test runs successfully using the new component test harness.


