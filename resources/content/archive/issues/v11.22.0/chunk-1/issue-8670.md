---
id: 8670
title: Implement Data Flow & Interaction Visuals
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:13:29Z'
updatedAt: '2026-01-15T02:36:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8670'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:36:06Z'
---
# Implement Data Flow & Interaction Visuals

## Objective
Implement the visual layer for data transmission and user interaction within the Neural Swarm.

## Tasks
1.  **Data Packets:** Create "pulses" of light that travel along the connections between nodes.
    -   Logic: Randomly spawn on a link, travel from Node A to Node B, then disappear.
2.  **Parallax:** Implement 3-4 layers of depth. Rear nodes should move slower than front nodes.
3.  **Interaction:**
    -   **Hover:** Mouse repulsion for Agents (they flee the cursor).
    -   **Click:** Spawn a "Signal Ripple" that propagates through the network.

## Technical Details
-   Optimize `drawNetwork` to handle these overlays without excessive draw calls.

## Timeline

- 2026-01-15T02:13:30Z @tobiu assigned to @tobiu
- 2026-01-15T02:13:31Z @tobiu added the `enhancement` label
- 2026-01-15T02:13:31Z @tobiu added the `ai` label
- 2026-01-15T02:13:32Z @tobiu added the `performance` label
- 2026-01-15T02:13:39Z @tobiu added parent issue #8661
- 2026-01-15T02:35:15Z @tobiu referenced in commit `70cc440` - "feat: Implement Data Flow & Interaction Visuals for Neural Swarm (#8670)"
### @tobiu - 2026-01-15T02:35:38Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Data Flow & Interaction Visuals.
> 
> **Changes:**
> 1.  **Initialization Fix:** Updated `updateSize` to force `initNodes` and `initAgents`. This solves the "top-left blob" issue where the simulation initialized with default dimensions before the canvas was sized.
> 2.  **Data Packets:**
>     -   Added `packetBuffer` (Float32Array).
>     -   Implemented `updatePackets`: Randomly spawns "pulses" that travel between connected nodes (Child -> Parent).
>     -   Implemented `drawPackets`: Renders traveling packets as glowing white dots with fade-out trails.
> 3.  **Shockwaves:**
>     -   Re-implemented `shockwaves` array and `drawShockwaves`.
>     -   Connected `updateMouseState` (click) to spawn shockwaves.
>     -   Connected `updatePhysics` to make nodes and agents "push away" from shockwaves.
> 4.  **Parallax Refinement:**
>     -   Updated `drawNetwork` to apply parallax depth to connections and nodes.
>     -   Added interaction highlight: Nodes now pulse when a shockwave passes through them.
> 
> The visual system is now complete: Nodes (Structure), Agents (Intelligence), and Packets (Data) all interacting in a simulated 2.5D space.

- 2026-01-15T02:36:06Z @tobiu closed this issue

