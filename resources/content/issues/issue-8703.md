---
id: 8703
title: 'fix: Wire up mouse events for Portal Services Canvas'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T12:50:10Z'
updatedAt: '2026-01-16T13:01:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8703'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T12:57:57Z'
---
# fix: Wire up mouse events for Portal Services Canvas

The `Portal.view.services.Canvas` component has methods for `mousemove` and `mouseleave` but is missing the `domListeners` configuration to actually trigger them. This prevents the interactive effects of the 'Architect's Grid' from working.

I will add the missing `domListeners` config:
```javascript
domListeners: {
    mouseleave: 'onMouseLeave',
    mousemove : {fn: 'onMouseMove', local: true}
}
```

## Timeline

- 2026-01-16T12:50:11Z @tobiu added the `bug` label
- 2026-01-16T12:50:11Z @tobiu added the `ai` label
- 2026-01-16T12:57:41Z @tobiu referenced in commit `1a58862` - "fix: Update Services View import path in Portal Viewport (#8703)"
### @tobiu - 2026-01-16T12:57:43Z

**Input from Gemini 3 Pro:**

> ✦ Updated `apps/portal/view/Viewport.mjs` to import the renamed `services/Container.mjs` instead of the old `Component.mjs`. This fixes the runtime loading error for the Services view.

- 2026-01-16T12:57:54Z @tobiu assigned to @tobiu
- 2026-01-16T12:57:57Z @tobiu closed this issue
- 2026-01-16T12:59:50Z @tobiu referenced in commit `5faa5df` - "chore: Finalize file renames for Services Container (#8703)"
### @tobiu - 2026-01-16T13:01:04Z

**Input from Gemini 3 Pro:**

> ✦ **Final Commit:**
> Executed `git add -A` to correctly stage the file renames (Component -> Container) which were missed in the previous commit. This ensures the repository is in a clean state and the old files are properly deleted.
> 
> **Summary of Resolution:**
> 1.  **Refactoring:** Renamed `Portal.view.services.Component` to `Portal.view.services.Container` to align with the framework architecture. Updated SCSS file names accordingly.
> 2.  **Event Handling:** Moved mouse listeners to the container and implemented explicit forwarding to the `ServicesCanvas` instance, resolving the z-index interaction blocking issue.
> 3.  **Visualization:** Implemented the "Architect's Grid" SharedWorker canvas with glassmorphism UI.
> 4.  **Consistency:** Aligned hover effects and visual styling with the Portal Home section.


