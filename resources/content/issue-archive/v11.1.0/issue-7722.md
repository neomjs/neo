---
id: 7722
title: 'Test: Relocate `healthHelpers.test.mjs` to Playwright harness'
state: CLOSED
labels:
  - ai
  - testing
assignees: []
createdAt: '2025-11-08T09:57:48Z'
updatedAt: '2025-11-10T20:03:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7722'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-10T20:03:08Z'
---
# Test: Relocate `healthHelpers.test.mjs` to Playwright harness

The new test file `ai/mcp/server/github-workflow/test/healthHelpers.test.mjs` is currently outside the main Playwright test harness. To ensure consistency and that it is picked up by the main test runner, it should be moved to `test/playwright/mcp/github-workflow/`.

## Timeline

- 2025-11-08T09:57:49Z @tobiu added the `ai` label
- 2025-11-08T09:57:50Z @tobiu added the `testing` label
- 2025-11-08T10:03:47Z @tobiu cross-referenced by PR #7717
- 2025-11-08T17:55:24Z @MannXo cross-referenced by PR #7730
- 2025-11-10T20:03:08Z @tobiu closed this issue

