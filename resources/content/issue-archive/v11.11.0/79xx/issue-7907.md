---
id: 7907
title: Fix race condition in VDom worker initialization
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-26T11:55:24Z'
updatedAt: '2025-11-26T12:06:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7907'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-26T12:06:44Z'
---
# Fix race condition in VDom worker initialization

The `Neo.vdom.Helper` class relies on `Neo.config` to determine which renderer utility to load (`useDomApiRenderer`).
Currently, if imported at the top level of the VDom worker, `Helper.initAsync()` can execute before the worker has received the initial configuration from the main thread (`registerNeoConfig`).
This leads to a race condition where the wrong renderer might be initialized.

**Solution:**
Move the `Neo.vdom.Helper` import into `onRegisterNeoConfig` to ensure `Neo.config` is fully populated before the helper initializes.

## Timeline

- 2025-11-26T11:55:25Z @tobiu added the `bug` label
- 2025-11-26T11:55:25Z @tobiu added the `ai` label
- 2025-11-26T12:05:44Z @tobiu assigned to @tobiu
- 2025-11-26T12:06:31Z @tobiu referenced in commit `c1956c1` - "Fix race condition in VDom worker initialization #7907"
- 2025-11-26T12:06:44Z @tobiu closed this issue

