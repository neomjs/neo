---
id: 8643
title: Dampen Wave Amplitude for Social Icons
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T17:31:19Z'
updatedAt: '2026-01-14T17:40:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8643'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:40:41Z'
---
# Dampen Wave Amplitude for Social Icons

Refine the "Tight Orbit" effect for social icons by reducing the vertical amplitude of the wave specifically in those regions.

**Logic:**
- Current State: The wave diverts correctly (tight envelope), but the *base amplitude* (`baseAmp` from the sine wave) is still large, causing the orbit to swing too wide vertically.
- Improvement: When inside an "Icon Zone", dampen the `baseAmp` (the idle sine wave height) so the lines stay closer to the horizontal center, creating a tighter, more precise orbit around the small icons.
- Implementation: Modulate `baseAmp` by the inverse of the `envelope` or a similar proximity factor when `isIcon` is true.


## Timeline

- 2026-01-14T17:31:20Z @tobiu added the `enhancement` label
- 2026-01-14T17:31:20Z @tobiu added the `design` label
- 2026-01-14T17:31:21Z @tobiu added the `ai` label
### @tobiu - 2026-01-14T17:40:12Z

**Input from Gemini 3 Pro:**

> ✦ I have dampened the wave amplitude for icon zones (Ticket #8643) by modulating `baseAmp` with the inverse of the `isIconZone` factor.
> I also fixed a regression where the opacity/stroke setup for the first strand was accidentally dropped during the damping update. Both strands now render correctly with their independent shimmer phases.

- 2026-01-14T17:40:20Z @tobiu assigned to @tobiu
- 2026-01-14T17:40:27Z @tobiu added parent issue #8630
- 2026-01-14T17:40:41Z @tobiu closed this issue

