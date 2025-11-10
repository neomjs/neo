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
closedAt: '2025-11-10T20:03:08Z'
---
# Test: Relocate `healthHelpers.test.mjs` to Playwright harness

**Reported by:** @tobiu on 2025-11-08

The new test file `ai/mcp/server/github-workflow/test/healthHelpers.test.mjs` is currently outside the main Playwright test harness. To ensure consistency and that it is picked up by the main test runner, it should be moved to `test/playwright/mcp/github-workflow/`.

