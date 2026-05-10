---
id: 9114
title: 'DevIndex: Add Status Toolbar and Progress Indication'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-12T16:05:32Z'
updatedAt: '2026-02-12T17:11:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9114'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-12T17:11:31Z'
---
# DevIndex: Add Status Toolbar and Progress Indication

- Enhance `Neo.grid.Container` to support `footerToolbar_` config, mirroring `headerToolbar`.
- Enhance `Neo.data.proxy.Stream` to fire `progress` events (bytes loaded vs total) when `Content-Length` is available.
- Create `DevIndex.view.home.StatusToolbar` containing:
    - `Neo.component.Progress` linked to the stream proxy.
    - "Visible Rows" label (moved from Controls panel).
- Update `DevIndex.view.home.GridContainer` to use the new footer toolbar.
- Remove the row count label from `DevIndex.view.home.ControlsContainer`.


## Timeline

- 2026-02-12T16:05:33Z @tobiu added the `enhancement` label
- 2026-02-12T16:05:33Z @tobiu added the `ai` label
- 2026-02-12T16:15:00Z @tobiu assigned to @tobiu
- 2026-02-12T17:10:57Z @tobiu referenced in commit `7d464a1` - "feat: Add StatusToolbar to DevIndex Grid with progressive streaming updates (#9114)"
### @tobiu - 2026-02-12T17:11:01Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the task.
> 
> **Changes:**
> 1.  **Framework Enhancement (Grid):**
>     -   `Neo.grid.Container` now supports a `footerToolbar` config.
>     -   Added `Neo.grid.footer.Toolbar` base class and SCSS.
>     -   Updated `Neo.grid.Container` layout to `vbox` with `flex-direction: column` to correctly stack header, body, and footer.
>     -   Ensured `footerToolbar` receives the grid's `store` reference automatically.
> 
> 2.  **Framework Enhancement (Data):**
>     -   `Neo.data.proxy.Stream` now fires `progress` events with `loaded` and `total` bytes.
>     -   `Neo.data.Store` relays these `progress` events.
> 
> 3.  **DevIndex Application:**
>     -   Created `DevIndex.view.home.StatusToolbar` extending `Neo.grid.footer.Toolbar`.
>     -   This toolbar listens to the store's `progress` and `load` events to show a progress bar and a "Visible Rows" count.
>     -   Removed the static "Visible Rows" label from `ControlsContainer`.
>     -   Updated `GridContainer` to use the new `StatusToolbar`.
> 
> The grid now displays a sticky footer with a real-time progress bar during data streaming and a live row count.

- 2026-02-12T17:11:31Z @tobiu closed this issue

