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
closedAt: '2025-10-04T17:52:12Z'
---
# Convert functional/Parse5Processor.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `functional/Parse5Processor.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/functional/Parse5Processor.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/functional/Parse5Processor.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-04 09:00

hello @tobiu I would like to work on this can you please assign it to me?

### @tobiu - 2025-10-04 09:21

done.

