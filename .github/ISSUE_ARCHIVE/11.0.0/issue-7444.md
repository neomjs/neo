---
id: 7444
title: Create Component Test form/field/Number.mjs in Playwright
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - erbierc
createdAt: '2025-10-10T16:58:38Z'
updatedAt: '2025-11-02T12:29:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7444'
author: tobiu
commentsCount: 4
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T12:29:18Z'
---
# Create Component Test form/field/Number.mjs in Playwright

**Reported by:** @tobiu on 2025-10-10

---

**Parent Issue:** #7435 - Create Component Tests in Playwright (and migrate existing tests from Siesta)

---

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns: https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to creat the component test for `form/field/Number.mjs` for the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/form/field/Number.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test can be similar to the of the original Siesta test (`test/components/files/form/field/Text.mjs`) for text fields, but requires new testing criteria: number fields can use triggers, for increasing or decreasing their value.
4.  Ensure the new test runs successfully via the component test runner.

## Comments

### @erbierc - 2025-10-12 21:09

I'd like to work on this!

### @tobiu - 2025-10-13 10:09

i just noted that we have 2 tickets for `form.field.Text`. I will update this one to test `form.field.Number` instead. super similar, but has no siesta counterpart.

### @tobiu - 2025-10-13 10:16

some ideas: look into `src/form/field/Text.mjs` and `src/form/field/Number.mjs` to see how it works (point your agent to it). Use `npm run build-all`, unless you have already done it for your fork. then use `npm run server-start`, and you can open examples like `examples/form/field/number` inside your browser.

as mentioned earlier, we can literally open 100+ additional tickets for component based testing alone.

### @erbierc - 2025-10-22 13:14

PR added: #7597 

