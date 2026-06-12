---
id: 8014
title: Update ai/services.mjs to use Neural Link
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-03T22:10:55Z'
updatedAt: '2025-12-03T22:12:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8014'
author: tobiu
commentsCount: 0
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T22:12:38Z'
---
# Update ai/services.mjs to use Neural Link

The `ai/services.mjs` file currently imports `BridgeService` from the deprecated `app-worker` server.
It needs to be updated to import `ConnectionService` from the new `neural-link` server to align with the new architecture.

**Tasks:**
1. Replace `AppWorker_BridgeService` with `NeuralLink_ConnectionService`.
2. Update exports to reflect the change.
3. Ensure `makeSafe` wrapper is applied if OpenAPI spec is available (or handle absence).

## Timeline

- 2025-12-03T22:10:57Z @tobiu added the `enhancement` label
- 2025-12-03T22:10:57Z @tobiu added the `ai` label
- 2025-12-03T22:10:57Z @tobiu added the `refactoring` label
- 2025-12-03T22:11:38Z @tobiu assigned to @tobiu
- 2025-12-03T22:12:02Z @tobiu added parent issue #7960
- 2025-12-03T22:12:28Z @tobiu referenced in commit `65872b7` - "Update ai/services.mjs to use Neural Link #8014"
- 2025-12-03T22:12:39Z @tobiu closed this issue

