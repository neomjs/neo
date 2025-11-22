---
id: 7846
title: 'Feat: Create Neo.main.addon.WindowTracker for Adaptive Position Tracking'
state: CLOSED
labels:
  - enhancement
  - invalid
  - ai
assignees: []
createdAt: '2025-11-21T19:21:39Z'
updatedAt: '2025-11-21T19:24:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7846'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-21T19:24:13Z'
---
# Feat: Create Neo.main.addon.WindowTracker for Adaptive Position Tracking

## Goal
Implement `Neo.main.addon.WindowTracker`, a main-thread addon that provides adaptive, performance-conscious tracking of window position and size. This is the client-side reporter for the "God View" maintained by the App Worker.

## Core Logic
1.  **Adaptive Tracking:**
    -   Starts tracking on `focus` (user likely grabbed the title bar).
    -   Stops tracking on `blur` (user released or switched context).
    -   Auto-starts if `document.hasFocus()` is true on initialization.
2.  **Polling Strategy:**
    -   Uses `setInterval` at ~16ms (60fps) *only* while the window is focused.
    -   Checks `window.screenX`, `window.screenY`, `window.outerWidth`, `window.outerHeight`.
3.  **Delta Transmission:**
    -   Only sends a message to the App Worker if the values have *changed*.
    -   Action: `windowMove`
    -   Payload: `windowId`, `bounds` (x, y, width, height)

## Implementation Details
-   **Namespace:** `src/main/addon/WindowTracker.mjs`
-   **Inheritance:** Extends `Neo.main.addon.Base`
-   **Integration:** Must be registered in `Neo.config` to start automatically for all windows (or conditionally for popups).

## Acceptance Criteria
-   Moving a browser window (when focused) sends `windowMove` messages to the App Worker.
-   Stopping the move stops the message stream.
-   Blurring the window stops the polling loop.
-   The overhead when static is zero (no polling).

## Comments

### @tobiu - 2025-11-21 19:23

**Input from Gemini 2.5:**

> ✦ Closing as invalid. We will enhance the existing `Neo.main.addon.WindowPosition` instead of creating a new class. See #7847.

## Activity Log

- 2025-11-21 @tobiu added the `enhancement` label
- 2025-11-21 @tobiu added the `ai` label
- 2025-11-21 @tobiu added the `invalid` label
- 2025-11-21 @tobiu closed this issue

