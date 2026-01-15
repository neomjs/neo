---
id: 8664
title: Implement Home Canvas Interaction & Parallax
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T01:06:07Z'
updatedAt: '2026-01-15T01:16:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8664'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T01:16:04Z'
---
# Implement Home Canvas Interaction & Parallax

- Implement Parallax scrolling effect (mouse-driven view shift).
- Implement interactive "Data Bursts" on hover/click.
- Fine-tune visual parameters (colors, glow, particle count).
- Ensure responsiveness (resize handling).

## Timeline

- 2026-01-15T01:06:08Z @tobiu added the `enhancement` label
- 2026-01-15T01:06:08Z @tobiu added the `ai` label
- 2026-01-15T01:06:18Z @tobiu added parent issue #8661
- 2026-01-15T01:13:23Z @tobiu assigned to @tobiu
- 2026-01-15T01:15:20Z @tobiu referenced in commit `1e92949` - "feat: Implement Home Canvas Interaction & Parallax (#8664)"
### @tobiu - 2026-01-15T01:15:33Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the interactive and depth features for the Neural Galaxy.
> 
> **Parallax System:**
> - Implemented a 3-layer parallax effect.
> - Front layer nodes (Layer 2) shift significantly (Factor 0.05) with mouse movement.
> - Mid and Back layers shift less, creating a "2.5D" depth illusion.
> 
> **Interaction System:**
> - **Repulsion Field:** The mouse cursor now exerts a physical force on nodes within a 150px radius, pushing them away gently.
> - **Connection Highlighting:** "Neural Links" (lines) glow brighter (`HIGHLIGHT` color) when the mouse is near, simulating active data transfer.
> - **Node Highlighting:** Nodes turn white and expand slightly when hovered.
> - **Physics Polish:** Added friction (0.98) and ambient drift to ensure nodes never stop moving but don't accelerate infinitely.
> 
> The result is a living, breathing background network that reacts to the user's presence.

- 2026-01-15T01:16:04Z @tobiu closed this issue

