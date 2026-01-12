---
id: 8158
title: Enhance onWindowConnect to include initial window data
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-26T23:57:58Z'
updatedAt: '2025-12-27T00:04:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8158'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-27T00:04:32Z'
---
# Enhance onWindowConnect to include initial window data

Currently, `Neo.manager.Window.onWindowConnect` registers a new window with a null rect. The rect is only updated later when `onWindowPositionChange` is received.

To improve this, we will enhance the `connect` event in the App worker to include initial window geometry.

**Implementation Plan:**
1.  Override `onConnect` in `src/worker/App.mjs` (do not call super).
2.  Inside the override, call `Neo.Main.getWindowData()` remotely on the connecting window.
3.  Fire the `connect` event with the enhanced payload: `{appName, windowId, windowData}`.
4.  Update `Neo.manager.Window.onWindowConnect` in `src/manager/Window.mjs` to extract the geometry from `windowData` and create the initial `Rectangle`.

This avoids the initial "null rect" state and ensures spatial awareness is available immediately upon connection.

## Timeline

- 2025-12-26T23:57:59Z @tobiu added the `enhancement` label
- 2025-12-26T23:57:59Z @tobiu added the `ai` label
- 2025-12-27T00:02:24Z @tobiu assigned to @tobiu
- 2025-12-27T00:04:23Z @tobiu referenced in commit `5c9f443` - "Enhance onWindowConnect to include initial window data #8158"
- 2025-12-27T00:04:32Z @tobiu closed this issue
- 2025-12-27T22:46:54Z @tobiu referenced in commit `0b41363` - "Enhance onWindowConnect to include initial window data #8158"

