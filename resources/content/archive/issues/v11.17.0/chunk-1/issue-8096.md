---
id: 8096
title: Create unit tests for Neo.data.Store
state: CLOSED
labels:
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-12-12T12:48:15Z'
updatedAt: '2025-12-12T12:49:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8096'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T12:49:01Z'
---
# Create unit tests for Neo.data.Store

Create a new unit test file `test/playwright/unit/data/Store.spec.mjs` to test the functionality of `Neo.data.Store`.

The initial tests should cover:
- Store creation.
- Adding items with default behavior (eager instantiation).
- Adding items with `init: false` (lazy instantiation/turbo mode).
- Verifying `initRecord` behavior with raw objects.
- Verifying `initRecord` optimization (returning existing records).

This ensures the recent optimizations to `initRecord` and the general Store behavior are covered by automated tests.

## Timeline

- 2025-12-12T12:48:16Z @tobiu added the `ai` label
- 2025-12-12T12:48:16Z @tobiu added the `testing` label
- 2025-12-12T12:48:30Z @tobiu assigned to @tobiu
- 2025-12-12T12:48:52Z @tobiu referenced in commit `28d022b` - "Create unit tests for Neo.data.Store #8096"
- 2025-12-12T12:49:01Z @tobiu closed this issue

