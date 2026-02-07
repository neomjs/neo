---
id: 9005
title: 'Feat: Refactor Portal Header to Framework (using Dynamic Worker Arch)'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-05T14:51:17Z'
updatedAt: '2026-02-07T16:01:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9005'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T16:01:23Z'
---
# Feat: Refactor Portal Header to Framework (using Dynamic Worker Arch)

Refactor the Portal Header (Toolbar and Canvas) into a reusable framework module `src/app/header` and update DevRank to use it.

**Context:**
Leverage the new **Dynamic Worker Architecture** (Epic #8948) used by `Sparkline`. We will also refactor `Portal.view.shared.Canvas` into the framework as it contains valuable shared logic (DOM listeners, etc.).

**Tasks:**

1.  **Canvas Infrastructure (Renderer):**
    *   Move `apps/portal/canvas/Base.mjs` to `src/canvas/Base.mjs` (renaming to `Neo.canvas.Base`).
    *   Move `apps/portal/canvas/HeaderCanvas.mjs` to `src/canvas/Header.mjs` (renaming to `Neo.canvas.Header`).
    *   Update `Neo.canvas.Header` to extend the new `Neo.canvas.Base`.

2.  **Shared Canvas Component:**
    *   Move `apps/portal/view/shared/Canvas.mjs` to `src/component/CanvasShared.mjs` (naming TBD, maybe `Neo.component.CanvasShared` or similar).
    *   Update it to be compatible with the new Dynamic Worker Architecture (removing dependency on `Portal.canvas.Helper`).

3.  **App Worker Components (`src/app/header`):**
    *   Create `src/app/header/Canvas.mjs`:
        *   Based on `apps/portal/view/HeaderCanvas.mjs`.
        *   Extend the new `Neo.component.CanvasShared` (or whatever we name it).
        *   Implement `initAsync` to use `Neo.worker.Manager.startWorker` and `Neo.worker.Canvas.loadModule` (Pattern: `Neo.component.Sparkline`).
    *   Create `src/app/header/Toolbar.mjs`:
        *   Based on `apps/portal/view/HeaderToolbar.mjs`.
        *   Update items to use the new `src/app/header/Canvas.mjs`.
    *   Create `src/app/header/ToolbarController.mjs`:
        *   Based on `apps/portal/view/HeaderToolbarController.mjs`.

4.  **DevRank Integration:**
    *   Update `apps/devrank/view/Viewport.mjs`:
        *   Layout: `vbox` (Main container).
        *   Item 1: `Neo.app.header.Toolbar` (The new reusable header).
        *   Item 2: `Container` with `card` layout (flex: 1).
            *   Card 1: `GridContainer` (DevRank Grid).
            *   Card 2: Placeholder Container (About/Todo).

5.  **Portal App Update:**
    *   Refactor Portal app to use the new `Neo.app.header.*` components and the new `Neo.component.CanvasShared`.

## Timeline

- 2026-02-05T14:51:19Z @tobiu added the `enhancement` label
- 2026-02-05T14:51:19Z @tobiu added the `ai` label
- 2026-02-05T14:51:20Z @tobiu added the `refactoring` label
- 2026-02-05T14:51:36Z @tobiu added parent issue #8930
- 2026-02-05T16:01:34Z @tobiu referenced in commit `2630be9` - "refactor: Finalize Header refactoring and path fixes (#9005)"
### @tobiu - 2026-02-05T16:01:37Z

**Input from Gemini 3 Pro:**

> ✦ I have finalized the refactoring of the Portal Header into the framework.
> 
> **Corrected Architecture:**
> 1.  **Framework (`src/app`):**
>     *   `src/app/SharedCanvas.mjs`: Generic base for worker-backed canvases (Dynamic Worker Architecture).
>     *   `src/app/header/Toolbar.mjs`: Generic base Toolbar (Structure + Canvas injection, no items).
>     *   `src/app/header/Canvas.mjs`: Header background visualization bridge.
> 
> 2.  **Portal App (`apps/portal`):**
>     *   `apps/portal/view/HeaderToolbar.mjs`: Extends `Neo.app.header.Toolbar`. Adds Portal-specific navigation items.
>     *   Updated `Viewport.mjs` to use local `HeaderToolbar`.
>     *   Fixed import paths in all `apps/portal/canvas/` files (`../../../src/canvas/Base.mjs`).
> 
> 3.  **DevRank App (`apps/devrank`):**
>     *   `apps/devrank/view/HeaderToolbar.mjs`: Extends `Neo.app.header.Toolbar`. Adds DevRank branding.
>     *   Updated `Viewport.mjs` to use local `HeaderToolbar`.
> 
> 4.  **Bug Fixes:**
>     *   Resolved "Renderer Remote Stub not found" race condition in `SharedCanvas.initAsync` by polling for the remote stub availability.
>     *   Corrected import path levels for `Neo.canvas.Base`.
> 
> The solution is now robust, generic, and correctly separated.

- 2026-02-05T16:05:01Z @tobiu referenced in commit `8be9295` - "#9005 Portal.view.HeaderToolbar: restored cls"
- 2026-02-05T16:09:52Z @tobiu referenced in commit `a9366d0` - "#9005 Neo.app.header.Canvas: theming and cleanup"
- 2026-02-05T16:47:14Z @tobiu referenced in commit `a260fbc` - "#9005 class names and cleanup"
- 2026-02-05T16:54:45Z @tobiu referenced in commit `5e34471` - "#9005 DevRank.view.HeaderToolbar: theming"
- 2026-02-05T17:16:29Z @tobiu referenced in commit `bcabba3` - "#9005 DevRank.view.ViewportController, styling, main thread addons, favicon"
- 2026-02-07T16:01:24Z @tobiu closed this issue
- 2026-02-07T16:01:27Z @tobiu assigned to @tobiu

