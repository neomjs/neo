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
blockedBy: []
blocking: []
closedAt: '2025-10-01T16:27:38Z'
---
# Convert core/EffectBatching.mjs Test from Siesta to Playwright

This task is to migrate the unit test for `core/EffectBatching.mjs` from the Siesta test harness to the Playwright test runner.

## Acceptance Criteria

1.  Create a new test file at `test/playwright/unit/core/EffectBatching.spec.mjs`.
2.  Translate all assertions from the original file (`test/siesta/tests/core/EffectBatching.mjs`) to the Playwright/Jest `expect` syntax.
3.  Ensure the new test runs successfully via `npm test`.
4.  The new test must cover all the functionality of the original Siesta test.

## Timeline

- 2025-09-27T13:40:02Z @tobiu added the `enhancement` label
- 2025-09-27T13:40:02Z @tobiu added parent issue #7262
- 2025-10-01T16:25:56Z @tobiu assigned to @tobiu
- 2025-10-01T16:27:19Z @tobiu referenced in commit `63b93cc` - "Convert core/EffectBatching.mjs Test from Siesta to Playwright #7280"
- 2025-10-01T16:27:39Z @tobiu closed this issue

