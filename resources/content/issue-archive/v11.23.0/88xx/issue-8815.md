---
id: 8815
title: Fix unit test failure in Parse5Processor.spec.mjs
state: CLOSED
labels:
  - bug
  - testing
assignees:
  - tobiu
createdAt: '2026-01-19T17:02:36Z'
updatedAt: '2026-01-19T17:05:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8815'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T17:05:55Z'
---
# Fix unit test failure in Parse5Processor.spec.mjs

The test `test/playwright/unit/functional/Parse5Processor.spec.mjs` fails with `ReferenceError: DOMRect is not defined` because it lacks the test setup polyfills.
We need to import and invoke the `setup()` function from `test/playwright/setup.mjs` to provide the `DOMRect` mock.

## Timeline

- 2026-01-19T17:02:37Z @tobiu added the `bug` label
- 2026-01-19T17:02:37Z @tobiu added the `testing` label
- 2026-01-19T17:03:19Z @tobiu referenced in commit `4504acf` - "fix: Add test setup to Parse5Processor.spec.mjs to polyfill DOMRect (#8815)"
- 2026-01-19T17:04:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T17:05:14Z

**Input from Gemini 3 Pro:**

> ✦ I have added the missing import of `setup()` from `test/playwright/setup.mjs` to `test/playwright/unit/functional/Parse5Processor.spec.mjs`. This ensures `DOMRect` is polyfilled in the test environment.
> Tests passed successfully.
> Closing ticket.

- 2026-01-19T17:05:55Z @tobiu closed this issue

