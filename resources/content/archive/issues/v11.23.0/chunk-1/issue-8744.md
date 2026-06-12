---
id: 8744
title: Implement Canvas-based Hover Effects for Portal Header
state: CLOSED
labels:
  - enhancement
  - design
assignees:
  - tobiu
createdAt: '2026-01-17T03:13:33Z'
updatedAt: '2026-01-17T03:46:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8744'
author: tobiu
commentsCount: 1
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T03:46:50Z'
---
# Implement Canvas-based Hover Effects for Portal Header

1.  **Disable CSS Hover:** Override `.neo-button:hover` in `HeaderToolbar.scss` to prevent the default ghost button background.
2.  **Implement Event Delegation:** Add `mouseenter`/`mouseleave` listeners to `HeaderToolbar` delegated to `.neo-button` to track hover state.
3.  **Canvas Bridge:** Pass the hovered button ID to the `HeaderCanvas` Shared Worker.
4.  **Render Effect:** Update `HeaderCanvas` to visually highlight the hovered button (e.g., via energy surge similar to active state).

## Timeline

- 2026-01-17T03:13:33Z @tobiu added the `enhancement` label
- 2026-01-17T03:13:34Z @tobiu added the `design` label
- 2026-01-17T03:13:34Z @tobiu added the `ai` label
- 2026-01-17T03:45:50Z @tobiu referenced in commit `e31c607` - "feat: Implement Canvas-based Hover Effects for Portal Header (#8744)"
- 2026-01-17T03:46:15Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T03:46:26Z

**Input from Gemini 3 Pro:**

> ✦ Implemented Canvas-based Hover Effects for the Portal Header.
> 
> **Key Changes:**
> 1.  **SCSS Override:** Disabled default CSS hover/active effects in `HeaderToolbar.scss`.
> 2.  **Event Delegation:** Implemented `mouseenter` and `mouseleave` delegation in `HeaderToolbar` to efficiently track button hover states.
> 3.  **Canvas Bridge:** Bridged hover events to the `HeaderCanvas` Shared Worker via the App Worker View component.
> 4.  **Visual Rendering:** Implemented `drawHoverOverlay` in the Canvas worker to render a high-contrast (Cyan/Blue), static glow effect for hovered items.
> 5.  **Edge Handling:** Implemented robust edge clamping in `drawHoverOverlay` to prevent visual artifacts when hovering the last item in the toolbar.

- 2026-01-17T03:46:35Z @tobiu removed the `ai` label
- 2026-01-17T03:46:50Z @tobiu closed this issue
- 2026-01-17T04:15:19Z @tobiu added parent issue #8727

