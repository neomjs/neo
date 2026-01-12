---
id: 7921
title: 'Feat: Real-time ''Blackboard'' Visualization'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:19:21Z'
updatedAt: '2025-11-30T20:37:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7921'
author: tobiu
commentsCount: 3
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T20:37:37Z'
---
# Feat: Real-time 'Blackboard' Visualization

# Feat: Real-time 'Blackboard' Visualization

## Context
The Command Center needs a way to visualize the state of the agent swarm in real-time. Since our protocol uses GitHub Issues as the bus, this component must poll (or stream) issue states and render them visually.

## Requirements
1.  **Data Source:** GitHub Issues (filtered by `agent-task` label).
2.  **Visualization:** A Kanban-style or Graph-style view.
    *   Nodes = Issues.
    *   Edges = Parent/Child relationships (Epic -> Ticket).
    *   Color = Status (Pending, In-Progress, Blocked, Done).
3.  **Tech Stack:** Neo.mjs `Helix` or `D3` wrapper for the visualization.

## Output
*   A reusable Neo.mjs component (`Neo.ai.ui.Blackboard`) that renders this graph.


## Timeline

- 2025-11-29T15:19:22Z @tobiu added the `enhancement` label
- 2025-11-29T15:19:22Z @tobiu added the `ai` label
- 2025-11-29T15:22:15Z @tobiu added parent issue #7918
### @tobiu - 2025-11-30T19:51:36Z

**Input from Gemini 2.5 Pro:**

> ✦ After architectural review, we have decided to implement the Blackboard visualization using **D3.js via Offscreen Canvas**.
> 
> **Rationale:**
> 1.  **Scalability:** Canvas rendering in a dedicated worker ensures performance remains high even with hundreds of nodes (tickets) and edges (dependencies).
> 2.  **Force-Directed Layout:** D3 is ideal for visualizing the complex parent/child and "blocked by" relationships that define the agent swarm's state.
> 3.  **Architecture:** This will be implemented as a `Neo.component.Canvas` subclass, delegating rendering logic to the `CanvasWorker` to keep the UI thread responsive.
> 
> **Plan:**
> 1.  Create `Neo.ai.ui.Blackboard` extending `Neo.component.Canvas`.
> 2.  Implement the graph rendering logic (nodes = issues, edges = links) using D3 in the Canvas context.
> 3.  Implement hit-detection to allow clicking nodes to select them in the UI.
> 

- 2025-11-30T20:33:32Z @tobiu assigned to @tobiu
- 2025-11-30T20:36:23Z @tobiu referenced in commit `2c9e991` - "Feat: Implement Blackboard Canvas PoC #7921"
### @tobiu - 2025-11-30T20:36:37Z

**Input from Gemini 2.5 Pro:**

> ✦ I have implemented the Proof of Concept (PoC) for the Blackboard Canvas visualization.
> 
> **Technical Achievements:**
> 1.  **Canvas Worker Architecture:** Established the App Worker <-> Canvas Worker bridge using `RemoteMethodAccess`.
> 2.  **Offscreen Canvas:** Implemented the transfer of the canvas control to the worker thread.
> 3.  **Canvas 2D Renderer:** Created a lightweight 2D rendering loop in `apps/agent-os/canvas/Blackboard.mjs` to draw nodes and links.
> 4.  **Multi-Window Integration:** Successfully embedded the Blackboard component into the Swarm (Child) Window.
> 
> **Current State:**
> The Swarm View now renders a live, animated 2D graph with placeholder nodes ("Root Agent", "Task 1", etc.), confirming the entire rendering pipeline is operational.
> 
> **Next Steps (New Tickets):**
> 1.  **D3 Force Integration:** Replace the dummy layout with a real D3 force simulation.
> 2.  **Data Binding:** Connect the graph to the live stream of GitHub Issues/Agents.
> 3.  **Interactivity:** Implement hit-detection to open the Intervention Panel on node click.
> 

### @tobiu - 2025-11-30T20:37:37Z

https://github.com/user-attachments/assets/37b483bf-5511-4e06-a1fd-c0a9efd3a1e6

- 2025-11-30T20:37:37Z @tobiu closed this issue

