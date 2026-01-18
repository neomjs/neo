---
id: 8771
title: Refine Portal Header Canvas Ribbon Opacity for Dark Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-17T23:46:21Z'
updatedAt: '2026-01-17T23:47:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8771'
author: tobiu
commentsCount: 2
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-17T23:47:48Z'
---
# Refine Portal Header Canvas Ribbon Opacity for Dark Theme

To improve the visual hierarchy of the Portal Header Canvas in the Dark Theme, we will reduce the opacity of the foreground ribbon fill.

**Problem:**
The current `fgRibbon` opacity in the dark theme creates a "glowing sheet" effect that competes with the sharp neon lines of the energy strands, making the visual result too busy and muddy.

**Solution:**
Reduce the opacity of the `fgRibbon` configuration in the dark theme by 50%. This makes the fill subtler, allowing the energy strands to pop more and reducing visual noise.

**Changes:**
1.  **HeaderCanvas:** Update `apps/portal/canvas/HeaderCanvas.mjs` to reduce the alpha values in the `dark.fgRibbon` array by 50%.

**User Approval:**
"approved" following the exploration and recommendation.


## Timeline

- 2026-01-17T23:46:22Z @tobiu added the `enhancement` label
- 2026-01-17T23:46:22Z @tobiu added the `design` label
- 2026-01-17T23:46:22Z @tobiu added the `ai` label
- 2026-01-17T23:46:42Z @tobiu added parent issue #8727
- 2026-01-17T23:47:19Z @tobiu referenced in commit `5c8cd01` - "enhancement: Refine Portal Header Canvas Ribbon Opacity for Dark Theme (#8771)"
- 2026-01-17T23:47:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-17T23:47:34Z

**Input from Gemini 3 Pro:**

> ✦ I have reduced the opacity of the Portal Header Canvas foreground ribbon (`fgRibbon`) for the dark theme.
> 
> **Changes:**
> 1.  **HeaderCanvas Update:** Modified `apps/portal/canvas/HeaderCanvas.mjs` to reduce the alpha values in the `dark.fgRibbon` array by 50% (from `0.05` to `0.025`).
> 
> This change makes the "sheet" fill subtler, allowing the neon energy strands to stand out more clearly against the dark background, reducing visual noise.

### @tobiu - 2026-01-17T23:47:36Z

**Input from Gemini 3 Pro:**

> ✦ Task complete. Ribbon opacity updated.

- 2026-01-17T23:47:48Z @tobiu closed this issue

