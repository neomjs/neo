---
id: 9520
title: 'LivePreview: Propagate active theme to popout child window'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-19T16:47:26Z'
updatedAt: '2026-03-19T16:50:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9520'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-19T16:50:16Z'
---
# LivePreview: Propagate active theme to popout child window

When popping out a LivePreview from a markdown tutorial inside the Portal app, the theme of the popup window does not reliably reflect the current theme of the Portal app (e.g. falling back to light theme even if the Portal uses dark theme). 

This happens because:
1. `apps/portal/childapps/preview/neo-config.json` is missing the `neo-theme-neo-dark` and `neo-theme-light` options, causing it to fall back to defaults when one of these is requested.
2. In `src/code/LivePreview.mjs` -> `onWindowConnect()`, the active theme is not explicitly passed to the `mainView` of the new window. Because the `previewView` itself already has the theme property internally set from its original creation context, applying the theme to `previewView` directly causes a no-op in the reactivity system, meaning the class is never added to the new DOM. Setting it on the window's `mainView` (the Viewport) resolves this cleanly and naturally cascades variables down.

This ticket aims to:
- Update `apps/portal/childapps/preview/neo-config.json` to mirror the Portal app's themes array.
- Update `src/code/LivePreview.mjs` to apply the current theme to the new `mainView` during `onWindowConnect()`.

## Timeline

- 2026-03-19T16:47:28Z @tobiu added the `bug` label
- 2026-03-19T16:47:28Z @tobiu added the `ai` label
- 2026-03-19T16:49:26Z @tobiu referenced in commit `f492172` - "fix: LivePreview popout window theme propagation (#9520)"
### @tobiu - 2026-03-19T16:49:43Z

**Input from Gemini 3.1 Pro:**

> ✦ The LivePreview popout window theme propagation issue has been fully resolved.
> 
> The core problem was twofold:
> 1. The child app (`apps/portal/childapps/preview/neo-config.json`) was missing the new `neo-theme-neo-dark` and `neo-theme-light` options in its `themes` array, causing it to fall back incorrectly.
> 2. In `src/code/LivePreview.mjs` -> `onWindowConnect()`, the active theme was not being properly cascaded to the new window. Because the `previewView` component already had its `theme` property internally set from its original creation context, applying the theme directly to it again caused a no-op in the config reactivity system (skipping `afterSetTheme`), meaning the class was never added to the new DOM root.
> 
> The solution ensures the `neo-config.json` themes are fully synchronized with the Portal app. Architecturally, the correct fix was applied by setting the active theme on the `mainView` (the Viewport) of the new popup window instead. The Viewport natively handles setting the root theme, which cascades correctly to `previewView` and all dynamically executed components (like the `FormContainer`).
> 
> All changes have been successfully committed and pushed to the `dev` branch.

- 2026-03-19T16:50:01Z @tobiu assigned to @tobiu
- 2026-03-19T16:50:16Z @tobiu closed this issue

