---
id: 7822
title: Refactor Neo.applyDeltas to use windowId instead of appName
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T11:45:09Z'
updatedAt: '2025-11-20T13:09:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7822'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T13:09:13Z'
---
# Refactor Neo.applyDeltas to use windowId instead of appName

**Goal:**
Refactor `Neo.applyDeltas(appName, deltas)` to `Neo.applyDeltas(windowId, deltas)` to support multi-window applications correctly.

**Context:**
Currently, `applyDeltas` relies on `appName` to route DOM update messages. In multi-window scenarios where multiple windows share the same `appName`, this ambiguity prevents targeting specific windows for DOM updates. Switching to `windowId` (which is unique per window) resolves this.

**Required Changes:**

1.  **Update `src/worker/App.mjs`:**
    *   Change `applyDeltas(appName, deltas)` signature to `applyDeltas(windowId, deltas)`.
    *   Update the message payload to send `windowId` instead of `appName`.

2.  **Update Usages:**
    *   Identify all call sites of `Neo.applyDeltas` and update them to pass `windowId`.
    *   Key locations identified include:
        *   `src/plugin/Responsive.mjs` (already partially addressed in previous steps, verify usage)
        *   `src/grid/Body.mjs`
        *   `src/selection/HelixModel.mjs`
        *   `src/selection/GalleryModel.mjs`
        *   `src/table/Body.mjs`
        *   `src/dialog/Base.mjs`
        *   `src/plugin/Resizable.mjs`
        *   `src/component/Helix.mjs`
        *   `src/component/Base.mjs`
        *   `src/mixin/VdomLifecycle.mjs`
        *   `src/calendar/view/month/Component.mjs`
        *   `src/calendar/view/week/EventDragZone.mjs`
        *   `src/calendar/view/week/Component.mjs`
        *   `src/calendar/view/week/plugin/DragDrop.mjs`

3.  **Update Main Thread Handling:**
    *   Update `src/Main.mjs` (`onUpdateDom`) to handle the incoming `windowId`.
    *   Update `src/main/DeltaUpdates.mjs` to use `windowId` for targeting the correct document/window context.

**Notes:**
*   This is a breaking change for custom components or plugins that use `Neo.applyDeltas` directly.
*   Ensure backward compatibility or migration paths if necessary (though internal framework usage seems to be the primary consumer).

## Timeline

- 2025-11-20T11:45:28Z @tobiu assigned to @tobiu
- 2025-11-20T11:45:42Z @tobiu added the `enhancement` label
- 2025-11-20T11:45:42Z @tobiu added the `ai` label
- 2025-11-20T12:13:10Z @tobiu referenced in commit `d938638` - "Refactor Neo.applyDeltas to use windowId instead of appName #7822"
- 2025-11-20T13:09:02Z @tobiu referenced in commit `60cf3c2` - "#7822 adjusted the testing suite to match the refactoring"
- 2025-11-20T13:09:13Z @tobiu closed this issue

