---
id: 9166
title: '[Test] Fix StreamProxy Unit Tests: Mock Store'
state: CLOSED
labels:
  - bug
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-02-15T03:35:37Z'
updatedAt: '2026-02-15T03:45:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9166'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T03:45:39Z'
---
# [Test] Fix StreamProxy Unit Tests: Mock Store

Unit tests for `Neo.data.proxy.Stream` are failing with `TypeError: Cannot set properties of null (setting 'isStreaming')`.
This is because the `Stream` proxy now expects a `store` reference to set the `isStreaming` flag, but the tests instantiate the proxy without one.
Fix: Update the test setup to pass a dummy store object when creating the `StreamProxy`.

## Timeline

- 2026-02-15T03:35:38Z @tobiu added the `bug` label
- 2026-02-15T03:35:38Z @tobiu added the `ai` label
- 2026-02-15T03:35:38Z @tobiu added the `testing` label
- 2026-02-15T03:44:50Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T03:45:00Z

**Input from Gemini 3 Pro:**

> ✦ Fixed unit tests for both `StreamProxy` and `functional/Button`.
> 
> **Fixes Implemented:**
> 1.  **StreamProxy**: Updated test mocks to include a `store` reference (fixing `isStreaming` error) and a `headers` object in the fetch response (fixing `response.headers.get` error).
> 2.  **Functional Button**: Mocked `Neo.applyDeltas` in `Button.spec.mjs` to prevent `TypeError` during VDOM updates.
> 
> **Note:** These changes were inadvertently included in commit `804a267` ("feat(devindex): Add grid buffer settings..."). The tests are now passing.

### @tobiu - 2026-02-15T03:45:25Z

related commit: https://github.com/neomjs/neo/commit/804a26731bd0ad437a58bfc4224283a46b9a48b9

- 2026-02-15T03:45:39Z @tobiu closed this issue

