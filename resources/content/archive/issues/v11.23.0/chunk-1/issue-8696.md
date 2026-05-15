---
id: 8696
title: Refine HomeCanvas colors for Light/Dark mode support
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T05:14:21Z'
updatedAt: '2026-01-16T05:24:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8696'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T05:24:13Z'
---
# Refine HomeCanvas colors for Light/Dark mode support

The `apps/portal/canvas/HomeCanvas.mjs` component currently uses hardcoded white colors for key visual elements like agent heads, packet signals, and shockwave cores. This renders them invisible against the default light background of the portal (`#fcfcfc`).

This ticket aims to:
1.  Implement a `theme` configuration in `HomeCanvas` to support both `light` and `dark` modes.
2.  Define color palettes for both themes to ensure high contrast and visibility.
    *   **Light Mode:** Dark/contrasting accents for agents and signals.
    *   **Dark Mode:** White/bright accents for visibility on pitch-black backgrounds.
3.  Update the rendering logic to use these dynamic colors instead of hardcoded strings.

This will prepare the Portal for a future dark theme switch while fixing immediate visibility issues.

## Timeline

- 2026-01-16T05:14:22Z @tobiu added the `enhancement` label
- 2026-01-16T05:14:22Z @tobiu added the `ai` label
- 2026-01-16T05:22:09Z @tobiu referenced in commit `ac7b27b` - "feat: Introduce light/dark theme support for HomeCanvas (#8696)"
- 2026-01-16T05:22:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T05:23:50Z

**Input from Gemini 3 Pro:**

> ✦ I have refactored `HomeCanvas.mjs` to support dynamic theming, addressing the visibility issues on light backgrounds.
> 
> **Changes:**
> 1.  **Added `theme` Config:** A new reactive `theme` config (defaults to `'light'`) controls the visual palette.
> 2.  **Color Palettes:** Defined `static colors` for `light` and `dark` modes.
>     *   **Light Mode:** Uses `PRIMARY` (#3E63DD) and `INDIGO` (#4B0082) for agents, sparks, and signals to ensure high contrast against the `#fcfcfc` background.
>     *   **Dark Mode:** Uses `#FFFFFF` for high visibility on dark backgrounds.
> 3.  **Dynamic Rendering:** Updated all draw methods (`drawAgents`, `drawNetwork`, `drawPackets`, `drawShockwaves`, `drawSparks`) to fetch colors from the active theme palette instead of using hardcoded values.
> 4.  **Resource Updates:** Added `afterSetTheme` to automatically update gradients and force a redraw when the theme changes.
> 5.  **Remote Access:** Exposed `setTheme` via the `remote` config to allow the App Worker to switch themes at runtime.
> 
> The "white on white" invisibility issue is resolved, and the canvas is now ready for a future dark mode toggle.

- 2026-01-16T05:24:13Z @tobiu closed this issue

