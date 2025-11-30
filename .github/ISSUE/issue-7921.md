---
id: 7921
title: 'Feat: Real-time ''Blackboard'' Visualization'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:19:21Z'
updatedAt: '2025-11-29T15:19:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7921'
author: tobiu
commentsCount: 0
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


## Activity Log

- 2025-11-29 @tobiu added the `enhancement` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added parent issue #7918

