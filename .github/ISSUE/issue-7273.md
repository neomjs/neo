---
id: 7273
title: Convert config/AfterSetConfig.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - tobiu
createdAt: '2025-09-27T13:17:58Z'
updatedAt: '2025-10-07T19:24:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7273'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-30T11:10:37Z'
---
# Convert config/AfterSetConfig.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `config/AfterSetConfig.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/config/AfterSetConfig.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/config/AfterSetConfig.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

