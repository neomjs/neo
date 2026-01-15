---
id: 8674
title: Implement Agent-Driven State
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:39:36Z'
updatedAt: '2026-01-15T03:04:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8674'
author: tobiu
commentsCount: 2
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T03:04:15Z'
---
# Implement Agent-Driven State

## Objective
Visualize the **Agent OS** controlling the runtime. Agents shouldn't just be observers; they should affect the system.

## Tasks
1.  **Energy Transfer:** When an Agent "scans" (hovers) a node, increment an `energy` value on that node.
2.  **Visual Feedback:** High energy nodes should glow brighter, grow larger, or spin faster.
3.  **Decay:** Node energy should slowly decay over time, creating a "heat map" of recent agent activity.

## Technical Details
-   Add `energy` field to `nodeBuffer` (update `NODE_STRIDE`).
-   Update `drawNetwork` to use `energy` for color/size modulation.

## Timeline

- 2026-01-15T02:39:36Z @tobiu assigned to @tobiu
- 2026-01-15T02:39:38Z @tobiu added the `enhancement` label
- 2026-01-15T02:39:38Z @tobiu added the `ai` label
- 2026-01-15T02:39:38Z @tobiu added the `performance` label
- 2026-01-15T02:39:53Z @tobiu added parent issue #8661
- 2026-01-15T02:59:55Z @tobiu referenced in commit `2bbf7f7` - "feat: Implement Agent-Driven State for Neural Swarm (#8674)"
### @tobiu - 2026-01-15T03:00:29Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented Agent-Driven State.
> 
> **Changes:**
> 1.  **State Model:** Added `energy` field (0.0 - 1.0) to `nodeBuffer` (index 8).
> 2.  **Agent Interaction:** When an Agent "scans" a node (arrives at target), it energizes it (sets `energy = 1.0`).
> 3.  **Physics:** Energy decays by 1% per frame (`*= 0.99`), creating a fading trail effect.
> 4.  **Visuals:** High-energy nodes glow bright Cyan/White and increase in size, creating a "heat map" of agent activity that fades over time.
> 
> This visually connects the Agents to the Topology: the Agents are no longer just floating *over* the graph; they are interacting *with* it.

### @tobiu - 2026-01-15T03:03:55Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the SyntaxError in `updateAgents`. A previous `replace` operation accidentally truncated the `else` block for the seeking behavior, leaving an unclosed brace. This has been restored.
> 
> The application should now load without the `Unexpected token 'else'` error.

- 2026-01-15T03:04:15Z @tobiu closed this issue

