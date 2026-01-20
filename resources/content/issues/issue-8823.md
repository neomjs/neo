---
id: 8823
title: 'test: Investigate RealWorldUpdates Regression'
state: OPEN
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-01-20T03:25:35Z'
updatedAt: '2026-01-20T03:55:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8823'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# test: Investigate RealWorldUpdates Regression

The recent VDOM race condition fixes (Ticket #8814) introduced a regression in `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`.

**Symptoms:**
- Tests fail with `0` or `1` delta received instead of expected `2`.
- Specifically, child updates are not being merged into the parent update or are being serialized such that `promiseUpdate()` only captures the parent's delta.

**Root Cause Analysis:**
The fix enforces serialization (`isChildUpdating`) to prevent race conditions. `RealWorldUpdates.spec.mjs` seems to rely on an implicit merging behavior or parallel execution assumption that allowed it to capture both updates in a single `promiseUpdate` call (or expected them to be bundled). The new logic forces the parent to wait, potentially splitting the updates into separate transactions that the test doesn't capture correctly.

**Action Item:**
Investigate if `RealWorldUpdates.spec.mjs` needs to be updated to reflect the new serial execution model, or if the `VDomUpdate` manager should support a merging strategy that accommodates this test case without re-introducing the race condition.
Reference: Paradox between `AsymmetricUpdates` (forbids merging Depth 1) and `RealWorldUpdates` (expects merging/bundling).

## Timeline

- 2026-01-20T03:25:36Z @tobiu added the `bug` label
- 2026-01-20T03:25:36Z @tobiu added the `ai` label
- 2026-01-20T03:25:36Z @tobiu added the `testing` label
- 2026-01-20T03:55:30Z @tobiu assigned to @tobiu

