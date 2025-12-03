---
id: 8004
title: Create Dedicated Example App for AI Bridge Testing
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees: []
createdAt: '2025-12-03T01:50:56Z'
updatedAt: '2025-12-03T01:50:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8004'
author: tobiu
commentsCount: 0
parentIssue: 7960
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Dedicated Example App for AI Bridge Testing

The PoC modified the existing `examples/button/base` to test the Neural Link. This is bad practice as it risks breaking existing tests and examples.

**Tasks:**
1.  Revert changes to `examples/button/base` (already done by user, but verify).
2.  Create a new dedicated example app for AI testing, e.g., `examples/ai/bridge`.
3.  Ensure this new example is isolated and does not interfere with core framework tests.
4.  Update the `test-app-worker.mjs` script to target this new example.

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu added the `testing` label
- 2025-12-03 @tobiu added parent issue #7960

