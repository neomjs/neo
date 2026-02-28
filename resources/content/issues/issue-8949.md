---
id: 8949
title: 'Feat: `Manager.startWorker` Remote Method'
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-02T13:59:43Z'
updatedAt: '2026-02-02T14:09:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8949'
author: tobiu
commentsCount: 1
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T14:09:49Z'
---
# Feat: `Manager.startWorker` Remote Method

Implement a remote method `startWorker(name)` in `src/worker/Manager.mjs`.

**Requirements:**
1.  **Check:** If the worker (e.g., 'canvas') is already active, return success immediately.
2.  **Create:** If not, use the existing `createWorker` and configuration injection logic to start it.
3.  **Handshake:** Ensure the new worker is fully connected (message channels established) before returning.
4.  **Expose:** Add `startWorker` to the `remote` config so the App worker can call it.

## Timeline

- 2026-02-02T13:59:44Z @tobiu added the `enhancement` label
- 2026-02-02T13:59:44Z @tobiu added the `ai` label
- 2026-02-02T13:59:44Z @tobiu added the `core` label
- 2026-02-02T14:00:28Z @tobiu added parent issue #8948
- 2026-02-02T14:09:19Z @tobiu referenced in commit `38a2d83` - "feat: Manager.startWorker Remote Method (#8949)"
### @tobiu - 2026-02-02T14:09:28Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `Manager.startWorker` with the correct signature `startWorker({name})` to comply with the `RemoteMethodAccess` protocol.
> - Added `startWorker` to the `remote.app` access list.
> - Method checks for existing workers before creation.
> - Handles config updates and registration automatically.

- 2026-02-02T14:09:36Z @tobiu assigned to @tobiu
- 2026-02-02T14:09:49Z @tobiu closed this issue

