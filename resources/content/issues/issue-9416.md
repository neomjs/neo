---
id: 9416
title: Add Error State & Events for Async Tree Loading
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T14:46:54Z'
updatedAt: '2026-03-09T14:51:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9416'
author: tobiu
commentsCount: 2
parentIssue: 9404
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-09T14:51:16Z'
---
# Add Error State & Events for Async Tree Loading

### Goal
Enhance the `TreeStore` and `TreeModel` to formally communicate network failures during asynchronous subtree expansion, providing both visual state hooks and application-level events.

### Architecture
1. **TreeModel Update:**
   - Add `hasError: Boolean` (defaultValue: false) to track nodes that failed to load their children.
2. **TreeStore Update (`expand()` method):**
   - When an async `load()` fails (catch block):
     - Set `node.isLoading = false` and `node.hasError = true`.
     - Fire `recordChange` to update the Grid UI (e.g., render a warning icon).
     - Fire a custom Store event: `me.fire('loadError', { record: node, error: err })`. This allows `ViewControllers` to catch the error and show a Toast notification.
   - When `expand()` is called on a node that already has `hasError = true` (user retrying):
     - Clear the error state (`node.hasError = false`) before attempting the fetch again.

### Dependencies
- Depends on the core `TreeStore` async implementation (#9413).

## Timeline

- 2026-03-09T14:46:55Z @tobiu added the `enhancement` label
- 2026-03-09T14:46:56Z @tobiu added the `developer-experience` label
- 2026-03-09T14:46:56Z @tobiu added the `ai` label
- 2026-03-09T14:46:56Z @tobiu added the `core` label
- 2026-03-09T14:47:34Z @tobiu added parent issue #9404
- 2026-03-09T14:48:10Z @tobiu assigned to @tobiu
- 2026-03-09T14:50:47Z @tobiu referenced in commit `1ce6de0` - "feat: Add Error State & Events for Async Tree Loading (#9416)

- Added `hasError` field to `Neo.data.TreeModel` to track failed async subtree requests.
- Updated `TreeStore.expand()` to catch network errors, set `node.hasError = true`, and fire a `loadError` event.
- This allows applications to visually flag failed folder expansions and show Toast notifications.
- Ensured `hasError` is cleared if the user retries the expansion."
### @tobiu - 2026-03-09T14:50:55Z

**Input from Gemini 3.1 Pro:**

> ✦ Implemented Error State & Events for Async Tree Loading.
> 
> - `TreeModel` now includes `hasError` (default `false`).
> - `TreeStore.expand()` sets `hasError` and fires a `loadError` event if the fetch fails, allowing graceful app-level recovery/notifications.
> - Added self-healing logic: re-clicking a failed node clears the error state and retries the fetch.
> 
> Changes pushed to `dev`.

### @tobiu - 2026-03-09T14:51:15Z

Implemented Error State for Async Tree Loading. Pushed to dev.

- 2026-03-09T14:51:16Z @tobiu closed this issue

