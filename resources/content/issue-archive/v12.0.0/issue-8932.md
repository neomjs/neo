---
id: 8932
title: 'Feat: DevRank UI - Grid & Controls Implementation'
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-02-01T15:26:35Z'
updatedAt: '2026-02-01T15:34:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8932'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-01T15:34:04Z'
---
# Feat: DevRank UI - Grid & Controls Implementation

This task focuses on implementing the initial UI for DevRank, inspired by the structure of the existing `examples/grid/bigData` demo.

### Goals
1.  **Layout:** Implement a `Neo.container.Viewport` with a buffered `Neo.grid.Panel` as the main view.
2.  **Controls:** Include a slide-out controls panel (hamburger menu trigger) for filtering.
3.  **Grid Configuration:**
    - Columns: Rank, User (Avatar + Name), Total Contributions, Avg/Year, First Year, Last Active.
    - Component Renderers: Use avatars and maybe sparklines (later) in grid cells.
4.  **Data Integration:** Connect the grid to the `DevRank.store.Contributors` store populated in the previous step.
5.  **Styling:** Adapt the SCSS from the Big Data example to ensure a polished look.

### Filters (Controls Panel)
- **Yearly Activity:** Range slider or inputs to filter users based on contributions in specific years (requires ensuring yearly data is in the JSON).
- **Search:** Username/Name filter.

### Reference
- `examples/grid/bigData`
- `resources/scss/src/examples/grid/bigData`


## Timeline

- 2026-02-01T15:26:37Z @tobiu added the `enhancement` label
- 2026-02-01T15:26:37Z @tobiu added the `design` label
- 2026-02-01T15:26:53Z @tobiu added parent issue #8930
- 2026-02-01T15:27:00Z @tobiu assigned to @tobiu
- 2026-02-01T15:33:19Z @tobiu referenced in commit `b3d6e59` - "feat: DevRank UI - Grid & Controls Implementation (#8932)"
### @tobiu - 2026-02-01T15:33:34Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the UI components for DevRank, following the structure of the Big Data example.
> 
> ### UI Components Implemented
> 1.  **DevRank.view.Viewport**: The main app container, handling the layout and integrating the Grid and Controls.
> 2.  **DevRank.view.GridContainer**: The buffered grid configuration.
>     - **Columns**: Rank (#), User (Avatar + Name), Total, Since (First Year), Last Active.
>     - **Renderer**: Added a custom HTML renderer for the User column to display the avatar and name.
> 3.  **DevRank.view.ControlsContainer**: The slide-out settings panel.
>     - **Toggle**: Hamburger menu button logic adapted for the DevRank layout.
>     - **Filters**: Added a 'Search User' text field. (Yearly activity slider placeholder is pending data availability).
> 4.  **Entry Point**: Updated `apps/devrank/app.mjs` to launch the new Viewport.
> 
> ### Styling
> - **SCSS**: Ported the sliding menu styles to `resources/scss/src/apps/devrank/ControlsContainer.scss` and `Viewport.scss`.
> 
> ### Next Steps
> - The data in `resources/data.json` currently powers the grid.
> - The next phase involves refining the discovery engine to populate this file with a larger dataset and implementing the logic for the filters in the ControlsContainer.

- 2026-02-01T15:34:05Z @tobiu closed this issue

