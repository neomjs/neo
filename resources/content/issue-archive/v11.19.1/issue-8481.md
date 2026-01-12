---
id: 8481
title: Fix Portal layout trashing by replacing JS-driven size classes with CSS Media Queries
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T19:45:36Z'
updatedAt: '2026-01-09T19:49:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8481'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T19:49:56Z'
---
# Fix Portal layout trashing by replacing JS-driven size classes with CSS Media Queries

The `SectionsContainer` (right sidebar) layout logic relies on the `portal-size-large` class which is applied via JS (`ResizeObserver` in `Viewport.mjs`). This causes a race condition (layout trashing) on page load where the content initially renders at full width before snapping to the correct width (minus the 250px sidebar).

**Root Cause:**
The CSS rules for `max-width` (in `Component.scss`) and `margin-right` (in `PageContainer.scss`) are nested inside the `.portal-size-large` selector. This class is only applied after the Viewport initializes and measures its size in the worker, causing a visual jump.

**Fix:**
Refactor `resources/scss/src/apps/portal/shared/content/Component.scss` and `resources/scss/src/apps/portal/shared/content/PageContainer.scss` to use the direct media query `@media (min-width: 1297px)` instead of relying on the JS-injected class. This ensures the layout is correct immediately upon first paint.

## Timeline

- 2026-01-09T19:45:37Z @tobiu added the `bug` label
- 2026-01-09T19:45:37Z @tobiu added the `ai` label
- 2026-01-09T19:49:23Z @tobiu referenced in commit `c76eee3` - "fix: Resolve Portal layout trashing by replacing JS-driven size classes with CSS Media Queries (#8481)"
- 2026-01-09T19:49:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T19:49:41Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `Component.scss` and `PageContainer.scss` to use direct CSS media queries (`min-width: 1297px`) instead of relying on the JavaScript-injected `.portal-size-large` class.
> 
> **Changes:**
> 1.  **`Component.scss`**: Un-nested the `max-width` rule. It now applies immediately when the viewport is wide enough, preventing the Markdown component from starting at 100% width and jumping.
> 2.  **`PageContainer.scss`**: Un-nested the `margin-right: 250px` rule. This ensures the content container reserves space for the fixed sidebar immediately during the first paint.
> 
> This resolves the layout trashing issue where the content would visually snap after the JS resize observer fired.
> 
> The changes have been pushed to `dev`.

- 2026-01-09T19:49:56Z @tobiu closed this issue

