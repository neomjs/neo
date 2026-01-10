---
id: 7436
title: Create Component Test Harness Config
state: CLOSED
labels:
  - enhancement
  - help wanted
  - hacktoberfest
  - ai
assignees:
  - Aki-07
createdAt: '2025-10-10T16:45:37Z'
updatedAt: '2025-10-11T09:58:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7436'
author: tobiu
commentsCount: 1
parentIssue: 7435
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-11T09:56:36Z'
---
# Create Component Test Harness Config

**IMPORTANT:** Before starting, please read the parent epic in detail to understand the required architecture and testing patterns: https://github.com/neomjs/neo/issues/7435

This is the first foundational task for the component testing R&D effort. The goal is to create a dedicated Playwright configuration file specifically for running component tests.

## Acceptance Criteria

1.  Create a new file at `test/playwright/playwright.config.component.mjs`.
2.  The configuration must enforce serial execution by setting `fullyParallel: false` and `workers: 1`.
3.  It must configure the `webServer` to use the `npm run server-start` command.
4.  The `testDir` should be set to `./component`.
5.  Refer to the parent epic for a complete example configuration.

## Timeline

- 2025-10-10 @tobiu added the `enhancement` label
- 2025-10-10 @tobiu added the `help wanted` label
- 2025-10-10 @tobiu added the `hacktoberfest` label
- 2025-10-10 @tobiu added parent issue #7435
- 2025-10-10 @tobiu added the `ai` label
### @Aki-07 - 2025-10-11 04:44

Hi, Working on this, could you assign me?

- 2025-10-11 @Aki-07 cross-referenced by PR #7457
- 2025-10-11 @tobiu closed this issue
- 2025-10-11 @tobiu assigned to @Aki-07

