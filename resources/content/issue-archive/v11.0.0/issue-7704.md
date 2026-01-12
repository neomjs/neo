---
id: 7704
title: Enhance `worker.App` RMA methods to delegate worker errors
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-11-04T18:56:05Z'
updatedAt: '2025-11-04T19:15:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7704'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-04T19:15:16Z'
---
# Enhance `worker.App` RMA methods to delegate worker errors

When using RMA methods like `createNeoInstance`, `destroyNeoInstance`, and `setConfigs` in Playwright component tests, any errors occurring within the App worker are not propagated back to the main thread test environment. This leads to opaque timeouts and difficult debugging.

These methods should be updated to follow the pattern used by `loadModule`. They should wrap their logic in a `try...catch` block. If an error occurs, they should return a result object containing the error details (e.g., `{success: false, error: {message: e.message}}`).

**Methods to Update:**
- `createNeoInstance`
- `destroyNeoInstance`
- `setConfigs`

This change will significantly improve the developer experience for component testing by making worker-side errors immediately visible in the test results.

## Timeline

- 2025-11-04T18:56:06Z @tobiu added the `enhancement` label
- 2025-11-04T18:56:06Z @tobiu added the `ai` label
- 2025-11-04T18:56:06Z @tobiu added the `testing` label
- 2025-11-04T18:56:22Z @tobiu assigned to @tobiu
- 2025-11-04T19:15:02Z @tobiu referenced in commit `1630b03` - "Enhance worker.App RMA methods to delegate worker errors #7704"
- 2025-11-04T19:15:16Z @tobiu closed this issue

