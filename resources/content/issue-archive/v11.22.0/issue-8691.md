---
id: 8691
title: Fix ServiceWorker Fetch Failure on Cache Quota Exceeded
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-15T13:25:29Z'
updatedAt: '2026-01-15T13:27:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8691'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T13:27:25Z'
---
# Fix ServiceWorker Fetch Failure on Cache Quota Exceeded

If the Cache Storage quota is exceeded, the `cache.put()` call in `onFetch` throws an error. Currently, this error propagates up the promise chain returned to `event.respondWith()`, causing the successful network request to be treated as a failure by the browser. This results in broken/missing resources.

The fix is to catch errors from `cache.put()` and ensure the network response is returned regardless of caching success. Logging will be suppressed to avoid console noise.


## Timeline

- 2026-01-15T13:25:30Z @tobiu added the `bug` label
- 2026-01-15T13:25:30Z @tobiu added the `ai` label
- 2026-01-15T13:25:30Z @tobiu added the `core` label
- 2026-01-15T13:26:46Z @tobiu referenced in commit `c1c8b32` - "fix: ServiceWorker Fetch Failure on Cache Quota Exceeded (#8691)"
### @tobiu - 2026-01-15T13:26:54Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the issue where `QuotaExceededError` during `cache.put()` would cause the fetch request to fail.
> 
> **Fix Implemented:**
> - Added a `.catch()` block to the `cache.put()` call in `ServiceBase.onFetch`.
> - This ensures that if the cache is full (or any other storage error occurs), the network response is still successfully returned to the browser.
> - Logging is suppressed to prevent console spam.
> 
> The changes have been pushed to `dev`.
> 

- 2026-01-15T13:27:02Z @tobiu assigned to @tobiu
- 2026-01-15T13:27:26Z @tobiu closed this issue

