---
id: 7920
title: 'Design: Agent Dashboard Layout (Multi-Window Architecture)'
state: CLOSED
labels:
  - design
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:19:18Z'
updatedAt: '2025-12-04T03:44:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7920'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-04T03:44:16Z'
---
# Design: Agent Dashboard Layout (Multi-Window Architecture)

## Context
As part of the Neo Command Center (Epic #7918), we need to design the "God View" UI. This app must leverage Neo.mjs's shared worker architecture to span multiple browser windows.

## Requirements
1.  **Window 1: Strategy (The CEO View):**
    *   Visualizes Epics and high-level Roadmap progress.
    *   KPI dashboard (Velocity, Ticket Completion Rate).
2.  **Window 2: The Swarm (The Matrix View):**
    *   A real-time grid of active agents.
    *   Visualizes the "thought stream" of selected agents.
3.  **Window 3: Intervention (The Hospital):**
    *   A dedicated space for "Blocked" agents.
    *   Interface for humans to inspect error logs and provide guidance.

## Output
*   A JSON Blueprint (Neo.mjs app definition) or detailed mockups describing this multi-window architecture.


## Timeline

- 2025-11-29T15:19:19Z @tobiu added the `design` label
- 2025-11-29T15:19:19Z @tobiu added the `ai` label
- 2025-11-29T15:21:37Z @tobiu added parent issue #7918
- 2025-12-04T03:36:57Z @tobiu assigned to @tobiu
- 2025-12-04T03:37:59Z @tobiu referenced in commit `87046bc` - "Design: Agent Dashboard Layout (Multi-Window Architecture) #7920"
### @tobiu - 2025-12-04T03:44:16Z

<img width="840" height="1214" alt="Image" src="https://github.com/user-attachments/assets/02baced1-55ca-4426-bf87-dab233119601" />

- 2025-12-04T03:44:16Z @tobiu closed this issue

