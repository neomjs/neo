---
id: 8118
title: Support OffscreenCanvas node movement between windows (SharedWorkers)
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-15T22:13:36Z'
updatedAt: '2025-12-15T23:25:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8118'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-15T23:25:38Z'
---
# Support OffscreenCanvas node movement between windows (SharedWorkers)

This ticket covers the changes required to support moving `OffscreenCanvas` nodes between windows when using `Neo.config.useSharedWorkers`. This is critical for drag-and-drop scenarios where a canvas component is moved from a container to a popup window and back, preventing "ownership already transferred" errors.

## Changes

### 1. `src/worker/Canvas.mjs`
- **Feature**: Introduced `canvasWindowMap` to track canvas instances by window ID.
- **Update**: `onRegisterCanvas` now populates this map.
- **New Method**: `onRetrieveCanvas` allows components to reclaim an existing canvas reference if it's already held by the worker for a specific window.

### 2. `src/component/Canvas.mjs`
- **Logic Update**: `afterSetMounted` now safely handles canvas transfer.
- **Flow**:
    1.  Requests offscreen canvas from Main thread.
    2.  If Main reports `transferred: true` (indicating prior transfer) AND shared workers are enabled:
        -   Falls back to requesting the existing canvas from the worker via `retrieveCanvas`.
    3.  If Main provides a new offscreen canvas:
        -   Registers it normally via `registerCanvas` (now including `windowId`).

### 3. `src/main/DomAccess.mjs`
- **Robustness**: `onGetOffscreenCanvas` now wraps `transferControlToOffscreen()` in a `try-catch` block.
- **Return Value**: Returns `{ transferred: true }` if the transfer fails, instead of throwing an error.
- **Safety**: Added a check for undefined `node` to prevent runtime errors.

### 4. `apps/agentos/view/ViewportController.mjs`
- **Fix**: Added `widget.mounted = true` in `onDragBoundaryEntry` to ensure correct component lifecycle state during re-integration.

## Goal
Enable seamless canvas reuse across windows without losing the `OffscreenCanvas` context or triggering DOM exceptions.

## Timeline

- 2025-12-15T22:13:38Z @tobiu added the `enhancement` label
- 2025-12-15T22:13:38Z @tobiu added the `ai` label
- 2025-12-15T22:14:02Z @tobiu assigned to @tobiu
- 2025-12-15T22:15:04Z @tobiu referenced in commit `9a5c96c` - "Support OffscreenCanvas node movement between windows (SharedWorkers) #8118"
### @tobiu - 2025-12-15T22:17:32Z

**Input from Gemini 2.5 pro:**

> ✦ For additional context, these changes were driven by two specific use cases:
> 
> 1.  **Advanced Dashboard Drag & Drop**: Supporting a scenario where a canvas node is effectively duplicated into a new popup window during a drag operation, and then potentially re-used (via the original node) if the popup is resolved back into an in-app drag proxy within the *same* drag operation. This requires the system to handle "already transferred" states gracefully when reusing the same DOM node.
> 2.  **Standard Cross-Window Movement**: Ensuring the logic remains robust for the standard pattern where a node is destroyed in Window A and a *new* node (with a new ID) is created in Window B, and potentially back again.
> 
> The refactored logic in `onRetrieveCanvas` and `DomAccess` ensures both the "hacky" reuse and the standard lifecycle work without errors.

- 2025-12-15T23:00:38Z @tobiu cross-referenced by #8119
- 2025-12-15T23:25:38Z @tobiu closed this issue

