---
id: 8038
title: Refactor AgentOS Strategy View into StrategyPanel
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-06T18:50:24Z'
updatedAt: '2025-12-06T20:37:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8038'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-06T20:37:15Z'
---
# Refactor AgentOS Strategy View into StrategyPanel

Extract the inline Strategy view from `apps/agentos/view/Viewport.mjs` into a new file `apps/agentos/view/StrategyPanel.mjs`.

**Requirements:**
1.  **New Class:** `AgentOS.view.StrategyPanel` extending `Neo.container.Panel`.
2.  **Dashboard Container:** The main item of this panel should be a `Neo.dashboard.Container`.
3.  **Horizontal Layout:** The dashboard should be configured to display items horizontally (e.g., `layout: {ntype: 'hbox', align: 'stretch'}`).
4.  **Cards:** Implement the 3 current KPI cards (Velocity, Active Epics, Uptime) as child Panels within the Dashboard.
5.  **Drag & Drop:** Enable drag & drop for these cards (horizontal resorting) and allow dragging them out to popups.
    *   Duplicate the DD logic from `ViewportController.mjs` into a new `StrategyPanelController.mjs` for now.
6.  **SCSS:** Refactor the SCSS to move specific strategy styles into `resources/scss/theme-cyberpunk/apps/agentos/StrategyPanel.scss`.

**Current Implementation:**
The strategy view is currently an inline `items` config in `Viewport.mjs`.

**Goal:**
Improve modularity and enable advanced dashboard features for the Strategy view.

## Timeline

- 2025-12-06T18:50:25Z @tobiu added the `enhancement` label
- 2025-12-06T18:50:25Z @tobiu added the `ai` label
- 2025-12-06T18:50:25Z @tobiu added the `refactoring` label
- 2025-12-06T18:50:41Z @tobiu assigned to @tobiu
- 2025-12-06T20:35:30Z @tobiu referenced in commit `fce09c9` - "Refactor AgentOS Strategy View into StrategyPanel #8038"
### @tobiu - 2025-12-06T20:36:11Z

**Input from Gemini 2.5 pro:**

> ✦ Refactoring and enhancement of the AgentOS Strategy View is complete.
> 
> **Key Changes:**
> 
> 1.  **Architecture & Modularization:**
>     *   Extracted the inline Strategy view from `Viewport.mjs` into a new dedicated class: `AgentOS.view.StrategyPanel`.
>     *   Created a dedicated controller `AgentOS.view.StrategyPanelController` to handle window management and drag-and-drop logic, mirroring the patterns established in `ViewportController`.
> 
> 2.  **Dashboard & Layout:**
>     *   Implemented `Neo.dashboard.Container` as the core of the `StrategyPanel`, configured with an `hbox` layout to display KPI cards horizontally.
>     *   Converted the 3 KPI cards (Velocity, Active Epics, Uptime) into child `Neo.container.Panel` instances.
> 
> 3.  **Drag & Drop Functionality:**
>     *   Enabled full drag-and-drop support for the KPI cards.
>     *   **Internal:** Cards can be reordered horizontally within the dashboard.
>     *   **External:** Cards can be dragged out of the main window to spawn separate popup windows (using the `neo-draggable` headers).
>     *   **Re-integration:** Closing a popup or dragging it back seamlessly returns the widget to its original position in the dashboard.
> 
> 4.  **UI & Theming (Cyberpunk):**
>     *   Refactored SCSS into a dedicated structure file: `resources/scss/src/apps/agentos/StrategyPanel.scss`.
>     *   **Design Update:** Moved KPI "Topics" (Velocity, etc.) to the panel headers to serve as drag handles.
>     *   **Visual Polish:** Implemented a "monolithic card" aesthetic where the panel header and body share a background color (`--agent-bg-panel`) to create an "elevated" look against the dark dashboard background. This was achieved by setting internal body backgrounds to `transparent` and applying styles to the wrapper.
>     *   Cleaned up legacy styles in `Viewport.scss` to prevent conflicts.
> 
> **Files Created/Modified:**
> *   `apps/agentos/view/StrategyPanel.mjs` (New)
> *   `apps/agentos/view/StrategyPanelController.mjs` (New)
> *   `apps/agentos/view/Viewport.mjs` (Updated)
> *   `resources/scss/src/apps/agentos/StrategyPanel.scss` (New)
> *   `resources/scss/src/apps/agentos/Viewport.scss` (Updated)
> 

- 2025-12-06T20:37:15Z @tobiu closed this issue

