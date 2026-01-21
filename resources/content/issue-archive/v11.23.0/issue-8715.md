---
id: 8715
title: 'Enhance ServicesCanvas Hover: Interactive Data Flow (Magnetic Runners)'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T16:29:07Z'
updatedAt: '2026-01-16T16:31:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8715'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T16:31:42Z'
---
# Enhance ServicesCanvas Hover: Interactive Data Flow (Magnetic Runners)

The current hover effect is purely visual (highlighting hexes) and feels "detached" from the simulation.
To fix this, we will make the mouse an active force in the physics engine.

**1. Magnetic Data Runners (Attraction)**
"Data follows Focus."
- Modify the random walk logic in `updateRunners`.
- Instead of picking a purely random direction (0-5), biased the selection towards the mouse position.
- Runners should "swarm" or flow towards the user's cursor if it is active.

**2. Debris Repulsion (Interaction)**
- Modify `updateDebris` to apply a repulsive force from the mouse cursor.
- This creates a "cleaning" effect, clearing the view where the user is looking.

**3. Visual Tweak**
- Ensure the "Energy" created by the mouse decays naturally, leaving a slight trail behind movement.

## Timeline

- 2026-01-16T16:29:08Z @tobiu added the `enhancement` label
- 2026-01-16T16:29:08Z @tobiu added the `ai` label
- 2026-01-16T16:29:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T16:31:26Z

**Input from Gemini 3 Pro:**

> ✦ Implemented interactive data flow:
> - **Magnetic Runners:** `updateRunners` now uses a weighted random choice for direction selection. The weights are inversely proportional to the distance to the mouse cursor, causing runners to naturally "swarm" or flow towards the user's focus point.
> - **Debris Repulsion:** `updateDebris` now applies a repulsive force to particles within a 150px radius of the mouse, creating a "cleaning" effect as the user explores the canvas.

- 2026-01-16T16:31:42Z @tobiu closed this issue
- 2026-01-16T16:35:32Z @tobiu referenced in commit `1eaa14e` - "enhancement: Implement Magnetic Runners and Debris Repulsion (#8715)"

