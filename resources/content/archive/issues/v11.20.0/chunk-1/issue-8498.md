---
id: 8498
title: ServiceWorker.preloadAssets crashes on 404s instead of handling errors gracefully
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-10T11:45:48Z'
updatedAt: '2026-01-10T11:58:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8498'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T11:58:56Z'
---
# ServiceWorker.preloadAssets crashes on 404s instead of handling errors gracefully

The `Neo.ServiceWorker.preloadAssets` method fails completely if any of the requested URLs return a 404 or network error.

**Current Behavior:**
The method uses `cache.addAll(items)`. If *any* request in the list fails, `cache.addAll` rejects the entire promise, adding *none* of the files to the cache. This results in an unhandled promise rejection or a crash in the calling code.

**Error:**
```
RemoteMethodAccess.mjs:216 TypeError: Failed to execute 'addAll' on 'Cache': Request failed
```

**Goal:**
Make `preloadAssets` more robust. It should gracefully handle failures, ideally by:
1.  Attempting to add files.
2.  If `addAll` fails (or by design), iterating and adding files individually so that valid files are cached even if one is missing.
3.  Returning a meaningful response to the caller (e.g., `{success: true, failed: ['url1', 'url2']}`) instead of crashing.

**Proposed Solution:**
Modify `src/worker/ServiceBase.mjs` -> `preloadAssets` to catch errors during fetch/cache operations and report partial successes or specific failures.

## Timeline

- 2026-01-10T11:45:49Z @tobiu added the `bug` label
- 2026-01-10T11:45:49Z @tobiu added the `ai` label
- 2026-01-10T11:45:49Z @tobiu added the `core` label
- 2026-01-10T11:46:03Z @tobiu assigned to @tobiu
- 2026-01-10T11:58:27Z @tobiu referenced in commit `9508c44` - "fix: Gracefully handle 404s in ServiceWorker.preloadAssets with success ratio (#8498)"
### @tobiu - 2026-01-10T11:58:39Z

**Input from tobiu:**

> ◆ Refactored `preloadAssets` to gracefully handle fetch errors (e.g., 404s) and provide detailed result metrics.
> 
> **New Behavior:**
> - **No Crash:** The method no longer throws/rejects if individual assets fail to load. It catches errors per file.
> - **Strict Success:** The `success` flag now indicates strict completion. `true` only if **all** requested files are available (pre-cached or successfully fetched). `false` if any file failed.
> - **Success Ratio:** Added a `ratio` property (0 to 1) indicating the percentage of available assets.
> - **Detailed Reporting:** Returns a `failed` array containing the URLs that could not be loaded.
> 
> **Return Object:**
> ```javascript
> {
>     failed: ['https://example.com/missing.jpg'],
>     ratio: 0.9, // 9/10 successful
>     success: false
> }
> ```
> 
> This allows developers to decide whether a partial success is acceptable for their use case.

- 2026-01-10T11:58:56Z @tobiu closed this issue

