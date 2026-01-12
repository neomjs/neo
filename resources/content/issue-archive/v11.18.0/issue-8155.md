---
id: 8155
title: Refactor dashboard.Container to manage detached item lifecycle
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-26T15:57:58Z'
updatedAt: '2025-12-26T17:23:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8155'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-26T17:23:33Z'
---
# Refactor dashboard.Container to manage detached item lifecycle

**Objective**
Move the logic for managing detached items (drag-to-window and re-integration) from application-level Viewport Controllers (e.g., `AgentOS.view.ViewportController`, `Colors.view.ViewportController`) into the core `Neo.dashboard.Container`. This will standardize the behavior and significantly improve Developer Experience (DX).

**Key Changes**

1.  **New Configs on `Neo.dashboard.Container`:**
    *   `detachToNewWindow` (Boolean, default `true`): Enables the drag-to-window feature.
    *   `popupConfig` (Object): Default window features (e.g., `{height: 600, width: 800}`).
    *   `popupUrl` (String|Function): A default template for the popup URL.
    *   `detachedItems` (Map): Internal state to track items currently in popups.

2.  **Per-Item Configuration:**
    *   Dashboard items (panels) can override the default `popupUrl` via a custom config (e.g., `popupUrl` property on the item itself). This is critical for applications like AgentOS where different widgets require different app shells (e.g., `swarm` uses a canvas-enabled shell).

3.  **Lifecycle Management:**
    *   Implement `onDragBoundaryExit` in `dashboard.Container` to handle opening the popup.
    *   Implement `onDragBoundaryEntry` in `dashboard.Container` to handle closing the popup and re-integrating the item.
    *   Handle `Neo.currentWorker` `connect`/`disconnect` events within the container to manage state when windows are closed manually.

4.  **Cleanup:**
    *   Remove the redundant logic from `AgentOS` and `Colors` Viewport Controllers.


## Timeline

- 2025-12-26T15:57:59Z @tobiu added the `enhancement` label
- 2025-12-26T15:57:59Z @tobiu added the `ai` label
- 2025-12-26T15:57:59Z @tobiu added the `refactoring` label
- 2025-12-26T16:03:12Z @tobiu cross-referenced by #8157
- 2025-12-26T16:08:29Z @tobiu assigned to @tobiu
- 2025-12-26T16:36:11Z @tobiu referenced in commit `4ac9f63` - "#8155 dashboard.Container: enhanced logic, updated the AgentOS main dashboard to use it."
- 2025-12-26T17:07:26Z @tobiu referenced in commit `cf8d18d` - "#8155 AgentOS.view.StrategyPanel: using the enhanced dashboard logic"
- 2025-12-26T17:22:11Z @tobiu referenced in commit `1fad668` - "#8155 dashboard.Container: documentation, apps/colors: using the new implementation"
- 2025-12-26T17:23:33Z @tobiu closed this issue
- 2025-12-26T17:29:03Z @tobiu cross-referenced by #8156

