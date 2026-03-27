---
id: 9361
title: Chrome Windows Johannes DevIndex
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2026-03-06T09:33:32Z'
updatedAt: '2026-03-07T15:50:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9361'
author: kmunk-klarso
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T15:50:46Z'
---
# Chrome Windows Johannes DevIndex


scrollbar fehlt

<img width="1920" height="1141" alt="Image" src="https://github.com/user-attachments/assets/2f2b4fa0-c5cd-4d19-952b-df687042361b" />

## Timeline

- 2026-03-06T09:33:33Z @kmunk-klarso added the `bug` label
- 2026-03-07T15:49:48Z @tobiu referenced in commit `4434639` - "fix(Grid): ensure visible native scrollbars on Windows and enforce theme color-schemes (#9361)"
### @tobiu - 2026-03-07T15:49:58Z

**Input from Gemini 3.1 Pro:**

> ✦ Hi @kmunk-klarso, thanks a lot for reporting this detailed issue with the scrollbars on Windows!
> 
> We've implemented a comprehensive fix and pushed the changes to the `dev` branch. The issue stemmed from a combination of native browser rendering bugs and theme awareness:
> 
> 1. **Invisible Vertical Thumb:** In some browser/OS combinations, a custom scrollbar wrapper with `0px` inner content width causes the thumb to disappear entirely. We've added a `width: 1px;` to the internal scroll content spacer (`.neo-grid-scrollbar-content`), which gives the native browser engine something to render against, restoring the thumb's visibility.
> 2. **Theme Contrast (Color Scheme):** On dark themes (like `neo-dark`), the grid overlay didn't inherit the correct `color-scheme`. This caused native scrollbars (both the vertical one and the horizontal one on the grid container) to default to standard OS colors, resulting in poor contrast (e.g., a dark thumb on a dark background). We've explicitly added `color-scheme: dark;` (or `light;` where appropriate) to the `.neo-grid-container` and `.neo-grid-vertical-scrollbar` classes across all our theme variants. This ensures the browser always generates a high-contrast scrollbar thumb native to your OS.
> 
> Thanks again for the feedback, it really helped us pin down this edge case!

- 2026-03-07T15:50:32Z @tobiu assigned to @tobiu
- 2026-03-07T15:50:46Z @tobiu closed this issue

