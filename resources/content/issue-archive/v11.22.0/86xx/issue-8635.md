---
id: 8635
title: Tune Sonic Wave Visuals
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T15:57:08Z'
updatedAt: '2026-01-14T16:09:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8635'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T16:09:24Z'
---
# Tune Sonic Wave Visuals

The HeaderCanvas is now stable and receiving data, but the visual output is not yet visible or aligned correctly.
- Investigate coordinate system alignment (canvas vs. toolbar).
- Tune visual parameters (intensity, color, stroke width).
- Ensure the "Aura" and "Shockwave" effects are visually distinct and appealing.

## Timeline

- 2026-01-14T15:57:09Z @tobiu added the `enhancement` label
- 2026-01-14T15:57:10Z @tobiu added the `ai` label
- 2026-01-14T15:58:12Z @tobiu added parent issue #8630
- 2026-01-14T16:09:05Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T16:09:09Z

**Input from Gemini 3 Pro:**

> ✦ I have completely rewritten the visual engine to use a "Split Stream" architecture.
> - Instead of drawing per-button waves, it now simulates a continuous energy stream across the entire header.
> - The stream normally flows as a double helix.
> - When it encounters a button, it smoothly splits (diverts up/down) to flow around it, effectively highlighting the button with negative space.
> - Hovering amplifies the turbulence/noise in that specific area.
> This creates the desired "Application Engine" feel of augmenting the UI.

- 2026-01-14T16:09:24Z @tobiu closed this issue

