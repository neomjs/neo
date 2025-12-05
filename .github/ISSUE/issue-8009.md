---
id: 8009
title: Fix reloadPage in Neo.ai.Client
state: OPEN
labels:
  - bug
  - ai
assignees: []
createdAt: '2025-12-03T12:02:24Z'
updatedAt: '2025-12-03T12:02:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8009'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Fix reloadPage in Neo.ai.Client

The current implementation of `reloadPage` in `Neo.ai.Client` uses `self.location.reload()`, which reloads the App Worker instead of the browser window. This effectively kills the application.

It should be updated to use `Neo.Main.reloadWindow()` to trigger a reload of the main browser window.

## Activity Log

- 2025-12-03 @tobiu added the `bug` label
- 2025-12-03 @tobiu added the `ai` label

