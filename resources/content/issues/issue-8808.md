---
id: 8808
title: Create Portal.view.shared.Canvas for App Worker Canvas Components
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-19T11:59:04Z'
updatedAt: '2026-01-19T12:19:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8808'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T12:19:05Z'
---
# Create Portal.view.shared.Canvas for App Worker Canvas Components

Refactor the four App Worker canvas components to share a common base class `Portal.view.shared.Canvas`.

**Location:** `apps/portal/view/shared/Canvas.mjs`

**Architecture:**
The base class will be generic and configured via strings to decouple it from specific worker implementations:
- `rendererClassName`: (String) e.g., `'Portal.canvas.HomeCanvas'`. Resolved via `Neo.ns()`.
- `importMethodName`: (String) e.g., `'importHomeCanvas'`. Resolved on `Portal.canvas.Helper`.
- `getRenderer()`: Helper method to resolve the singleton instance from `rendererClassName`.

**Scope:**
1.  Create `apps/portal/view/shared/Canvas.mjs`
2.  Refactor `Portal.view.home.parts.hero.Canvas`
3.  Refactor `Portal.view.services.Canvas`
4.  Refactor `Portal.view.HeaderCanvas`
5.  Refactor `Portal.view.news.tickets.TimelineCanvas`

**Common Logic to Extract:**
- `isCanvasReady_` config and theme syncing
- `afterSetOffscreenRegistered` lifecycle (calls the dynamic import and `initGraph`)
- `ResizeObserver` registration
- `updateSize` logic (communicates with `getRenderer()`)
- Event forwarding (`onClick`, `onMouseMove`, `onMouseLeave`)
- `getCanvasId` logic
- `getRenderer()` helper using `Neo.ns()`

## Timeline

- 2026-01-19T11:59:05Z @tobiu added the `ai` label
- 2026-01-19T11:59:05Z @tobiu added the `refactoring` label
- 2026-01-19T12:00:04Z @tobiu cross-referenced by #8807
### @tobiu - 2026-01-19T12:18:11Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `Portal.view.shared.Canvas` base class and refactored the following components to extend it:
> - `Portal.view.home.parts.hero.Canvas`
> - `Portal.view.services.Canvas`
> - `Portal.view.HeaderCanvas`
> - `Portal.view.news.tickets.TimelineCanvas`
> 
> This unifies lifecycle management, resize observation, and event bridging, using the `rendererClassName` and `renderer` getter pattern. Duplicated logic has been removed.

- 2026-01-19T12:18:18Z @tobiu assigned to @tobiu
- 2026-01-19T12:18:23Z @tobiu referenced in commit `9b0df00` - "refactor: Introduce Portal.view.shared.Canvas base class (#8808)

Extracted common logic for offscreen canvas lifecycle, resize observation, and event bridging into a shared base class. Refactored Header, Home, Services, and Timeline canvas components to extend this base class. Standardized renderer access via 'rendererClassName' config."
- 2026-01-19T12:19:06Z @tobiu closed this issue

