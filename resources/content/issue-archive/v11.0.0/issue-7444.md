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
blockedBy: []
blocking: []
closedAt: '2025-11-02T12:29:18Z'
---
# Create Component Test form/field/Number.mjs in Playwright

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns: https://github.com/neomjs/neo/issues/7435

This task is part of **Phase 2** and is blocked by the completion of Phase 1 (Test Harness Setup).

This task is to creat the component test for `form/field/Number.mjs` for the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/component/form/field/Number.spec.mjs`.
2.  Follow the architectural guide outlined in the parent epic for component test migration.
3.  The new test can be similar to the of the original Siesta test (`test/components/files/form/field/Text.mjs`) for text fields, but requires new testing criteria: number fields can use triggers, for increasing or decreasing their value.
4.  Ensure the new test runs successfully via the component test runner.

## Timeline

- 2025-10-10T16:58:40Z @tobiu added the `enhancement` label
- 2025-10-10T16:58:40Z @tobiu added parent issue #7435
- 2025-10-10T16:58:40Z @tobiu added the `help wanted` label
- 2025-10-10T16:58:40Z @tobiu added the `hacktoberfest` label
- 2025-10-10T16:58:41Z @tobiu added the `ai` label
### @erbierc - 2025-10-12T21:09:22Z

I'd like to work on this!

### @tobiu - 2025-10-13T10:09:09Z

i just noted that we have 2 tickets for `form.field.Text`. I will update this one to test `form.field.Number` instead. super similar, but has no siesta counterpart.

- 2025-10-13T10:09:14Z @tobiu assigned to @erbierc
- 2025-10-13T10:09:41Z @tobiu changed title from **Convert Component Test form/field/Text.mjs to Playwright** to **Create Component Test form/field/Number.mjs in Playwright**
### @tobiu - 2025-10-13T10:16:11Z

some ideas: look into `src/form/field/Text.mjs` and `src/form/field/Number.mjs` to see how it works (point your agent to it). Use `npm run build-all`, unless you have already done it for your fork. then use `npm run server-start`, and you can open examples like `examples/form/field/number` inside your browser.

as mentioned earlier, we can literally open 100+ additional tickets for component based testing alone.

- 2025-10-21T20:00:48Z @erbierc cross-referenced by PR #7597
### @erbierc - 2025-10-22T13:14:33Z

PR added: #7597 

- 2025-11-02T12:29:18Z @tobiu closed this issue

