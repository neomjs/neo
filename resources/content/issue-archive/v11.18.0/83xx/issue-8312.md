---
id: 8312
title: Fix Neural Link Window Topology Race Condition
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-04T14:20:07Z'
updatedAt: '2026-01-04T14:37:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8312'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T14:37:42Z'
---
# Fix Neural Link Window Topology Race Condition

The Neural Link Client (`Neo.ai.Client`) currently relies on `Neo.manager.Window` to report connected windows. However, `Neo.manager.Window` is imported dynamically in `Neo.worker.App` only when `useSharedWorkers` is true. This creates a race condition where the Client might connect and attempt to send the window topology before the Window Manager is loaded, resulting in an empty window list (0 connected windows) in the Neural Link status.

**Proposed Fix:**
Add a static import for `Neo.manager.Window` in `src/ai/Client.mjs`. Since the Neural Link functionality inherently requires window awareness (for topology, drag-drop, etc.), the Window Manager should be a hard dependency for the AI Client, ensuring it is always available when the Client initializes.

**Tasks:**
1.  Modify `src/ai/Client.mjs` to import `Neo.manager.Window`.
2.  Remove the optional chaining checks for `Neo.manager.Window` inside `Client.mjs` where appropriate, as it will now be guaranteed.

## Timeline

- 2026-01-04T14:20:09Z @tobiu added the `bug` label
- 2026-01-04T14:20:09Z @tobiu added the `ai` label
- 2026-01-04T14:21:00Z @tobiu added parent issue #8169
- 2026-01-04T14:21:02Z @tobiu assigned to @tobiu
- 2026-01-04T14:35:23Z @tobiu referenced in commit `8374db6` - "Fix Neural Link connection logic & race condition #8312"
### @tobiu - 2026-01-04T14:37:21Z

**Input from Gemini 3:**

> ✦ Fixed the window topology race condition and a WebSocket double-encoding bug.
> 
> **Changes:**
> 1.  **Race Condition:** `src/worker/App.mjs` now captures the `import('../ai/Client.mjs')` promise and awaits it in `onConnect`. This ensures `Neo.ai.Client` is fully loaded before the `connect` event is fired, guaranteeing that `window_connected` notifications are sent reliably.
> 2.  **Dependency:** `src/ai/Client.mjs` now statically imports `Neo.manager.Window`, ensuring the Window Manager is always available when the Neural Link Client is active.
> 3.  **Communication Bug:** Removed double JSON stringification in `Client.mjs` `sendMessage` calls. The `Neo.data.connection.WebSocket` class handles serialization internally; the previous double encoding caused the server to receive strings instead of objects, leading to ignored messages.

- 2026-01-04T14:37:42Z @tobiu closed this issue

