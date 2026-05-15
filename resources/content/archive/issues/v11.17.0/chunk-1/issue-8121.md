---
id: 8121
title: 'Fix popup window sizing: race condition, caching, and rounding'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-16T13:39:14Z'
updatedAt: '2025-12-16T14:35:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8121'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-16T14:35:42Z'
---
# Fix popup window sizing: race condition, caching, and rounding

We encountered and fixed multiple issues related to drag-and-drop popup window sizing and management.

**1. Race Condition in DragProxyContainer Sizing**
*   **Problem:** `DragProxyContainer` (used in `SortZone`) was created with `layout: 'fit'` but initially empty. Its DOM element would render with a default/minimal height (e.g., 155px) before the dragged content (e.g., 220px) was inserted.
*   **Impact:** The main thread `DragDrop` addon would sometimes capture this initial "empty" height during `drag:move`, causing `dragBoundaryExit` events to report incorrect `proxyRect` dimensions.
*   **Fix:** Updated `src/draggable/DragZone.mjs` to explicitly set `config.height` and `config.width` on the `DragProxyContainer` at creation time, matching the dragged element's dimensions.

**2. Browser Window Dimension Caching**
*   **Problem:** Re-opening a popup window with the same `window.name` caused browsers (like Chrome) to ignore the new `windowFeatures` (height/width) and instead reuse the cached dimensions from the previous session. This persisted the incorrect "155px" height even after the race condition was fixed.
*   **Impact:** Popup windows would open with the wrong size.
*   **Fix:** Refactored `src/Main.mjs` to use `crypto.randomUUID()` for the actual browser window target name. This ensures every `windowOpen` call creates a fresh window context, bypassing the cache. We also enhanced the internal `openWindows` map to store `{win, targetName}` to maintain correct logical references.

**3. Fractional Window Dimensions**
*   **Problem:** Calculated popup dimensions (e.g., `219.5px`) were being passed to `window.open`.
*   **Impact:** Browsers expect integer values for `windowFeatures`. Passing floats can lead to parsing errors or unpredictable fallback behaviors.
*   **Fix:** Updated `apps/agentos/view/StrategyPanelController.mjs` to round all calculated dimensions (`height`, `width`, `left`, `top`) using `Math.round()` before passing them to `windowOpen`.

**Changes:**
- `src/draggable/DragZone.mjs`: Explicitly set container proxy height.
- `src/Main.mjs`: Implemented UUID-based window targeting and refactored `openWindows` map.
- `apps/agentos/view/StrategyPanelController.mjs`: Added rounding to window feature calculations.

## Timeline

- 2025-12-16T13:39:15Z @tobiu added the `bug` label
- 2025-12-16T13:39:15Z @tobiu added the `ai` label
- 2025-12-16T13:39:15Z @tobiu added the `refactoring` label
- 2025-12-16T13:39:51Z @tobiu assigned to @tobiu
- 2025-12-16T13:40:51Z @tobiu referenced in commit `647c5c9` - "Fix popup window sizing: race condition, caching, and rounding #8121"
- 2025-12-16T14:30:58Z @tobiu referenced in commit `f91e513` - "#8121 enforcing a "fixed" popup size"
### @tobiu - 2025-12-16T14:33:46Z

**Input from Gemini:**

> ✦ ### Final Resolution & Insights
> 
> We encountered a persistent issue where popup windows would resize unpredictably (e.g., jumping from 156px to 219px, or getting stuck at 156px) even up to 300ms after opening. This was caused by the browser attempting to adapt the window size to the content:
> 
> 1.  **The Problem:** When requesting a window with `height=219`, the browser interprets this as the *inner* height (viewport). However, due to browser chrome (headers/toolbars), the effective *outer* height becomes larger (e.g., ~282px). If the dragged content (219px) was then inserted into a window where the inner height was reduced by chrome (e.g., 156px), the browser would sometimes auto-expand the window to fit the content, causing layout shifts.
> 2.  **The Fix ("Give Size"):** We implemented a strategy to immediately call `openedWindow.resizeTo(openedWindow.outerWidth, openedWindow.innerHeight)` upon creation. This effectively forces the window's **outer height** to match the **current inner height**.
>     *   This locks the dimensions, ensuring the popup's total footprint exactly matches the drag proxy.
>     *   It prevents the browser from auto-resizing based on content insertion later in the lifecycle.
> 
> **New Feature: `useTotalHeight`**
> We added an optional `useTotalHeight` config to `Neo.Main.windowOpen` (defaults to `true`).
> *   **Concept:** This acts similarly to `box-sizing: border-box` in CSS.
> *   **Behavior:** It ensures the requested height is treated as the **total outer height** of the window, ignoring the size of browser header tools. This guarantees that a 219px drag proxy results in exactly a 219px popup window, preserving the visual continuity of the drag operation.

- 2025-12-16T14:35:42Z @tobiu closed this issue

