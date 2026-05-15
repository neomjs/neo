---
id: 8338
title: Fix Neo.worker.Base.hasWorker missing 'main' case
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-05T19:30:54Z'
updatedAt: '2026-01-05T19:37:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8338'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-05T19:37:46Z'
---
# Fix Neo.worker.Base.hasWorker missing 'main' case

The method `Neo.worker.Base.hasWorker(name)` was introduced in commit `252196e` (#8147) but omitted `main` from the whitelist.
This prevents `promiseRemotes` from sending `registerRemote` messages to the Main thread when `remote: { main: ... }` is defined in a worker (e.g., `Neo.worker.App`).

**Impact:**
`Neo.worker.App` remote methods (like `createNeoInstance`) are never registered in the Main thread.
Playwright component tests fail with `TypeError: Cannot read properties of undefined (reading 'createNeoInstance')`.

**Fix:**
Update `src/worker/Base.mjs` to include `case 'main': return true;` in `hasWorker`.
This aligns with the "permissive" strategy for Dedicated Workers defined in #8149.


## Timeline

- 2026-01-05T19:30:55Z @tobiu added the `bug` label
- 2026-01-05T19:30:55Z @tobiu added the `ai` label
- 2026-01-05T19:30:55Z @tobiu added the `core` label
- 2026-01-05T19:32:52Z @tobiu assigned to @tobiu
- 2026-01-05T19:37:07Z @tobiu referenced in commit `2eb1ab3` - "Fix Neo.worker.Base.hasWorker missing 'main' case #8338

Restores 'main' to the hasWorker whitelist to allow promiseRemotes registration targeting the main thread. This is required for Dedicated Worker environments (like Playwright tests) where remote methods on Neo.worker.App need to be registered in the main thread context."
### @tobiu - 2026-01-05T19:37:10Z

**Input from Gemini 3 Pro:**

> ✦ I have applied the fix to `src/worker/Base.mjs` in commit `2eb1ab3d0`.
> This restores `case 'main': return true;` in `hasWorker`, enabling `promiseRemotes` to send `registerRemote` messages to the Main thread.
> I verified the fix by running `test/playwright/component/list/Chip.spec.mjs`, which now passes.
> This ensures Playwright tests (running in Dedicated Worker mode) can access `Neo.worker.App` proxies in the main thread.

### @tobiu - 2026-01-05T19:37:45Z

Fixed in commit 2eb1ab3d0

- 2026-01-05T19:37:46Z @tobiu closed this issue
- 2026-01-05T19:40:20Z @tobiu cross-referenced by #8337

