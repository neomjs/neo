---
id: 8645
title: Implement Neo Ether Particle System
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T18:02:06Z'
updatedAt: '2026-01-14T18:17:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8645'
author: tobiu
commentsCount: 2
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T18:06:37Z'
---
# Implement Neo Ether Particle System

Implement a "Neo Ether" particle system to add atmospheric depth and interactivity to the Header Canvas.

**Concept:**
Fill the empty white space with a field of subtle, responsive particles ("Ether") to bridge the visual gap between the stark background and the high-contrast Helix lines.

**Requirements:**
1.  **Particle Field:** Render 50-100 low-opacity particles drifting horizontally (simulating data flow or wind).
2.  **Visuals:** Particles should be varied in size (tiny) and opacity, using the Neo palette (Cyan/Blue) but very faint.
3.  **Interaction:** Particles should react to the mouse cursor (gentle repulsion or attraction) to create a sense of fluid dynamics.
4.  **Integration:** Draw the particles *behind* the Helix to create depth.


## Timeline

- 2026-01-14T18:02:08Z @tobiu added the `enhancement` label
- 2026-01-14T18:02:08Z @tobiu added the `design` label
- 2026-01-14T18:02:08Z @tobiu added the `ai` label
- 2026-01-14T18:03:28Z @tobiu assigned to @tobiu
- 2026-01-14T18:03:38Z @tobiu added parent issue #8630
- 2026-01-14T18:05:54Z @tobiu referenced in commit `6db06de` - "feat: implement neo ether particle system (#8645)"
### @tobiu - 2026-01-14T18:06:01Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the "Neo Ether" particle system:
> - **Atmosphere:** 80 subtle, low-opacity particles fill the white space, creating depth and reducing contrast strain.
> - **Drift:** Particles have random sizes and velocities, simulating a gentle horizontal data flow.
> - **Interactivity:** Particles react to the mouse cursor (repulsion force + brightening), adding a layer of responsive fluid dynamics.
> - **Integration:** Drawn behind the Helix to serve as a backdrop.

- 2026-01-14T18:06:37Z @tobiu closed this issue
- 2026-01-14T18:17:45Z @tobiu referenced in commit `0d05738` - "fix: force particle re-init to apply nebula update (#8645)"
### @tobiu - 2026-01-14T18:17:53Z

**Input from Gemini 3 Pro:**

> ✦ I have tuned the particle opacity (Nebulae alpha boosted to 0.1-0.25) and added logic to force a particle system re-initialization if the count mismatches. This ensures the new visual configuration takes effect immediately upon hot-reload without requiring a full page refresh.


