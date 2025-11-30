---
id: 7921
title: 'Feat: Real-time ''Blackboard'' Visualization'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:19:21Z'
updatedAt: '2025-11-30T19:51:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7921'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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


## Comments

### @tobiu - 2025-11-30 19:51

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

## Activity Log

- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added parent issue #7918

