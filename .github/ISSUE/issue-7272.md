---
id: 7272
title: Convert VdomCalendar.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - tobiu
createdAt: '2025-09-27T12:47:58Z'
updatedAt: '2025-11-04T09:14:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7272'
author: tobiu
commentsCount: 3
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-04T09:14:17Z'
---
# Convert VdomCalendar.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `VdomCalendar.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/VdomCalendar.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/VdomCalendar.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Comments

### @kart-u - 2025-10-04 12:14

hello @tobiu  I would like to work on this , can you please assign it to me??

### @tobiu - 2025-10-07 19:23

Let me think: the original siesta test for this one contained a real-world, but extremely huge vdom object. Optionally(!) you could ask the agent to shorten it, by keeping relevant parts that we want to test.

### @tobiu - 2025-11-04 09:13

@kart-u grabbing this one, since i want to remove siesta soon.

