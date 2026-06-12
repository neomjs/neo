---
id: 9188
title: Implement Stop Stream Capability for DevIndex
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-16T23:40:05Z'
updatedAt: '2026-02-17T00:21:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9188'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-17T00:21:59Z'
---
# Implement Stop Stream Capability for DevIndex

This task implements a "Stop Stream" capability for the DevIndex application to allow users to cancel large data streams. This is a critical usability feature for users on slow or metered connections.

**Objectives:**
1.  **Proxy Enhancement (`src/data/proxy/Stream.mjs`):**
    -   Implement an `abort()` method using `AbortController`.
    -   Ensure the fetch request and stream reader are properly cancelled.
    -   Gracefully handle the abort signal without throwing visible errors to the user (unless intended).
2.  **Store Integration (`src/data/Store.mjs`):**
    -   Expose an `abort()` method that delegates to the active proxy.
    -   Ensure the store state (`isLoading`, `isStreaming`) is correctly reset upon cancellation.
3.  **UI Implementation (`apps/devindex/view/home/StatusToolbar.mjs`):**
    -   Add a "Stop" button (icon: `fa-stop` or `fa-ban`) next to the progress bar.
    -   Bind the button's visibility to the store's loading state.
    -   Wire the click event to the store's `abort()` method.

**Acceptance Criteria:**
-   [ ] `Stream.abort()` successfully cancels the network request.
-   [ ] `Store.abort()` stops the loading process and resets loading flags.
-   [ ] The grid remains functional with the data loaded up to the point of cancellation.
-   [ ] A "Stop" button appears in the StatusToolbar during streaming and disappears when finished or stopped.
-   [ ] Clicking the "Stop" button cancels the stream immediately.

## Timeline

- 2026-02-16T23:40:06Z @tobiu added the `enhancement` label
- 2026-02-16T23:40:06Z @tobiu added the `ai` label
- 2026-02-16T23:41:02Z @tobiu assigned to @tobiu
- 2026-02-16T23:41:09Z @tobiu added parent issue #9106
- 2026-02-17T00:21:31Z @tobiu referenced in commit `9dd97e7` - "feat(devindex): Implement Stop Stream capability with progressive chunk sizing (#9187, #9188)"
### @tobiu - 2026-02-17T00:21:40Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Stop Stream" capability.
> 
> **Changes:**
> 1.  **Proxy:** Added `abort()` to `Stream.mjs` using `AbortController`.
> 2.  **Store:** Exposed `abort()` to delegate to the proxy.
> 3.  **UI:**
>     -   Added a "Stop" button to `StatusToolbar.mjs`.
>     -   Wired it to `up.onStopButtonClick` -> `store.abort()`.
>     -   Styled with `devindex-stop-stream-button` class and red icon color (`--devindex-stop-stream-button-color`).
>     -   Used `fa-ban` for the icon to strictly signal "Abort".
> 
> The grid now allows users to cancel the data stream at any time, preserving the data loaded up to that point.

- 2026-02-17T00:21:59Z @tobiu closed this issue
- 2026-02-17T00:52:13Z @tobiu cross-referenced by #9189

