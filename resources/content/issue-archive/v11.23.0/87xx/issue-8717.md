---
id: 8717
title: 'Refine ServicesCanvas Holograms: Add Volumetric Pillars'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T16:37:44Z'
updatedAt: '2026-01-16T17:04:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8717'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T17:04:58Z'
---
# Refine ServicesCanvas Holograms: Add Volumetric Pillars

The current holographic projection (floating ghost hex) lacks visual connection to the base, making the 3D effect feel weak or like a 2D overlay.

**Solution: Volumetric Pillars**
To emphasize the volume and perspective:
1.  **Draw Vertical Connectors:** Draw lines connecting the corners of the base hex (z=0) to the corners of the floating hex (z=-popZ).
2.  **Effect:** This will create a "Hexagonal Prism" or "Beam" effect, making the projection look like a solid 3D structure rising from the grid.
3.  **Style:** Use faint, transparent strokes for these connectors to simulate light beams.

## Timeline

- 2026-01-16T16:37:45Z @tobiu added the `enhancement` label
- 2026-01-16T16:37:45Z @tobiu added the `ai` label
- 2026-01-16T16:38:23Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T16:57:31Z

**Input from Gemini 3 Pro:**

> ✦ Repurposing this ticket. The "Volumetric Pillars" idea was rejected.
> **New Goal: Integrate Dark Blue Brand Color.**
> 
> We need to integrate the "Dark Blue" (Neo Primary: `#3E63DD`) into the ServicesCanvas visual identity.
> 
> **Requirements:**
> 1.  **Super Hexes:** Change the fill style of Super Hexes from faint white to `PRIMARY` (Dark Blue) with `0.3` opacity. This makes them look like solid "chips" on the board.
> 2.  **Kernel Layer:** Change the Kernel background grid color to a very faint `PRIMARY` instead of faint white/grey, integrating the brand color into the deep background.
> 3.  **Runner Tails:** Update runner tails to fade from White -> Cyan -> Dark Blue -> Transparent, adding depth to the data flow.

### @tobiu - 2026-01-16T17:04:28Z

**Input from Gemini 3 Pro:**

> ✦ Integrated Neo Dark Blue (#3E63DD):
> - **Super Hexes:** Changed to Dark Blue (opacity 0.3) for a solid "chip" look.
> - **Kernel Layer:** Changed to very faint Dark Blue (opacity 0.08) for a branded depth effect.
> - **Runners:** Updated tails to gradient from Transparent -> Dark Blue -> Cyan -> White, creating a richer data flow visualization.

- 2026-01-16T17:04:39Z @tobiu referenced in commit `acaaba7` - "enhancement: Integrate Dark Blue Brand Color into ServicesCanvas (#8717)"
- 2026-01-16T17:04:58Z @tobiu closed this issue

