---
id: 7261
title: Convert core/Effect.mjs Siesta Test to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-26T14:16:30Z'
updatedAt: '2025-09-26T14:31:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7261'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-26T14:31:57Z'
---
# Convert core/Effect.mjs Siesta Test to Playwright

**Reported by:** @tobiu on 2025-09-26

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

As part of the ongoing effort to migrate the testing suite from Siesta to Playwright, the unit test for `core/Effect.mjs` needs to be converted.

This involves translating the existing test at `test/siesta/tests/core/Effect.mjs` into a new Playwright spec file.

## Acceptance Criteria

- Create a new Playwright unit test file at `test/playwright/unit/core/Effect.spec.mjs`.
- Convert all assertions and test logic from the Siesta test to the Playwright/Jest `expect` syntax.
- Ensure the new test is self-contained and passes successfully.
- All other tests in the suite must continue to pass.

