---
id: 7280
title: Convert core/EffectBatching.mjs Test from Siesta to Playwright
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-27T13:40:01Z'
updatedAt: '2025-10-01T16:27:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7280'
author: tobiu
commentsCount: 0
parentIssue: 7262
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-01T16:27:38Z'
---
# Convert core/EffectBatching.mjs Test from Siesta to Playwright

**Reported by:** @tobiu on 2025-09-27

---

**Parent Issue:** #7262 - Enhance Development Workflow with Mandatory Unit Testing

---

This task is to migrate the unit test for `core/EffectBatching.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/core/EffectBatching.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/core/EffectBatching.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

