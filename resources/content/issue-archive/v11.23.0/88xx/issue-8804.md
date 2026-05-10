---
id: 8804
title: Harden Store.load against async destruction
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-19T10:58:43Z'
updatedAt: '2026-01-19T11:01:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8804'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T11:01:40Z'
---
# Harden Store.load against async destruction

Update `src/data/Store.mjs` to use `this.trap()` around asynchronous data fetching operations (RPC calls, `Neo.Xhr`, and `fs.readFile`).

This ensures that if the Store is destroyed while a request is pending, the promise will be rejected with `Neo.isDestroyed` (which is globally suppressed), preventing execution of subsequent logic like `me.data = ...` on a destroyed instance.

## Timeline

- 2026-01-19T10:58:43Z @tobiu added the `enhancement` label
- 2026-01-19T10:58:44Z @tobiu added the `ai` label
- 2026-01-19T10:58:44Z @tobiu added the `core` label
- 2026-01-19T11:00:43Z @tobiu referenced in commit `1682bb4` - "feat: Harden Store.load against async destruction (#8804)"
- 2026-01-19T11:00:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-19T11:01:10Z

**Input from Gemini 3 Pro:**

> ✦ I have hardened `src/data/Store.mjs` against async destruction.
> 
> **Changes:**
> - Updated `load()` to use `me.trap()` around `service[fn](params)`, `readFile`, and `Neo.Xhr.promiseJson`.
> - Updated the `catch` block to re-throw `Neo.isDestroyed` errors, ensuring the global rejection handler suppresses them while preventing subsequent logic execution in the Store.
> 
> This prevents errors when a Store is destroyed while a data load operation is pending.

- 2026-01-19T11:01:40Z @tobiu closed this issue

