---
id: 7920
title: 'Design: Agent Dashboard Layout (Multi-Window Architecture)'
state: OPEN
labels:
  - design
  - ai
assignees: []
createdAt: '2025-11-29T15:19:18Z'
updatedAt: '2025-11-29T15:19:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7920'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Design: Agent Dashboard Layout (Multi-Window Architecture)

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


## Activity Log

- 2025-11-29 @tobiu added the `design` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu added parent issue #7918

