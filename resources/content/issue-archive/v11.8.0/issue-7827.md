---
id: 7827
title: Initialize Neo.apps in App worker and optimize window-specific events
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T20:28:38Z'
updatedAt: '2025-11-20T20:36:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7827'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T20:36:45Z'
---
# Initialize Neo.apps in App worker and optimize window-specific events

**Problem**
1. `Neo.apps` and `Neo.appsByName` are lazily initialized in `Neo.controller.Application#construct`. Accessing them in `Neo.worker.App` (e.g., `createNeoInstance`) before any app is created can cause a crash if they are `undefined`.
2. `onVisibilityChange` and `onOrientationChange` currently iterate over all apps to find the matching instance or broadcast the event. Since these events are tied to a specific window, we can use a direct lookup for better performance and correctness.

**Proposed Changes**
1.  **Initialize Global Maps:** In `src/worker/App.mjs` `construct()`, initialize `Neo.apps` and `Neo.appsByName` to `{}`.
2.  **Optimize `onVisibilityChange`:** Replace the `Object.values(Neo.apps)` iteration with a direct lookup: `Neo.apps[msg.data.windowId]`.
3.  **Optimize `onOrientationChange`:** Replace the `Object.values(Neo.apps)` iteration with a direct lookup using the windowId from the event data.

**Note on `createNeoInstance`:**
The fallback logic `let appName = Object.values(Neo.apps)[0]?.name` is preserved but becomes safe due to the initialization in step 1.

## Timeline

- 2025-11-20T20:28:39Z @tobiu added the `enhancement` label
- 2025-11-20T20:28:39Z @tobiu added the `ai` label
- 2025-11-20T20:29:12Z @tobiu assigned to @tobiu
- 2025-11-20T20:36:36Z @tobiu referenced in commit `d6cb7fa` - "Initialize Neo.apps in App worker and optimize window-specific events #7827"
- 2025-11-20T20:36:45Z @tobiu closed this issue

