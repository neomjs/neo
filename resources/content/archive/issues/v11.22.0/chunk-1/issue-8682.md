---
id: 8682
title: Optimize Neural Swarm Contrast for Light Theme
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T09:04:41Z'
updatedAt: '2026-01-15T09:14:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8682'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T09:14:16Z'
---
# Optimize Neural Swarm Contrast for Light Theme

## Objective
Address low contrast issues for the "Neural Swarm" canvas on light backgrounds (#fcfcfc). The current visual effects (shockwaves, connections, sparks) were optimized for a dark background during testing and lose visibility in the production light theme.

## Visual Challenges
1.  **Invisible Sparks:** White/Cyan sparks on a white/light-blue gradient background are nearly invisible.
2.  **Weak Shockwaves:** The white-hot core and cyan echoes blend into the light background.
3.  **Low-Contrast Connections:** Light gray connections get lost in the ambient gradient.

## Proposed Solution (Adaptive Contrast)
Implement a "Dark Mode" switch or simply optimize the palette for Light Mode without losing the "Neon" feel.

**Strategy: "Inverted Neon" for Light Mode**
-   **Connections:** Use darker, saturated blues (#3E63DD) instead of light grays.
-   **Shockwave:** Instead of pure additive light (Screen), use `multiply` or darker stroke colors (Deep Blue/Purple) to create "Energy Scars" that cut through the brightness.
-   **Sparks:** Use dark blue or violet sparks (#4B0082) so they pop against the white.

## Tasks
1.  **Palette Update:** Define a `THEME` object in `HomeCanvas` with separate palettes for Light/Dark (or just optimize for Light now).
2.  **Spark Contrast:** Change spark color to a deep, saturated Indigo/Violet.
3.  **Shockwave Contrast:** Experiment with darker stroke colors or `multiply` blending for the shockwave rings.
4.  **Connection Contrast:** Darken the inactive connection lines.


## Timeline

- 2026-01-15T09:04:42Z @tobiu added the `enhancement` label
- 2026-01-15T09:04:43Z @tobiu added the `design` label
- 2026-01-15T09:04:43Z @tobiu added the `ai` label
- 2026-01-15T09:13:13Z @tobiu referenced in commit `d3ca07c` - "feat: Optimize Neural Swarm contrast for light theme (#8682)"
### @tobiu - 2026-01-15T09:13:15Z

**Input from Gemini 3 Pro:**

> ✦ Implemented "Inverted Neon" palette for Light Theme:
> - **Sparks:** Deep Indigo (`#4B0082`) with no blur for maximum visibility on white.
> - **Shockwave:** Removed `screen` blending. Switched to Crimson/Medium-Blue rings with a Blue-tinted pressure fill.
> - **Connections:** Darkened inactive lines (`#808080`) to prevent them from vanishing in the background gradient.
> - **Highlight:** Changed to Deep Sky Blue (`#00BFFF`) for better contrast.

- 2026-01-15T09:13:49Z @tobiu added parent issue #8661
- 2026-01-15T09:13:57Z @tobiu assigned to @tobiu
- 2026-01-15T09:14:16Z @tobiu closed this issue

