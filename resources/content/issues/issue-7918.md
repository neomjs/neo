---
id: 7918
title: 'Epic: Neo Command Center (Agent OS UI)'
state: OPEN
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:17:50Z'
updatedAt: '2025-12-04T23:32:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7918'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7920 Design: Agent Dashboard Layout (Multi-Window Architecture)'
  - '[x] 7921 Feat: Real-time ''Blackboard'' Visualization'
  - '[ ] 7922 Feat: ''Derailment'' Intervention Interface'
  - '[x] 7954 Task: Scaffold Agent OS Application'
  - '[x] 7955 Feat: Implement Agent OS Multi-Window Layout'
  - '[x] 7956 Feat: Multi-Window Orchestration Baseline'
  - '[x] 8018 Feat: Implement Drag-to-Popup Dashboard'
  - '[ ] 8019 Bug: isWindowDragging flag stuck after external drop'
  - '[x] 8021 Refactor AgentOS SCSS: Split Source and Variables'
  - '[ ] 8022 Refactor AgentOS Viewport: Modularize Components'
  - '[x] 8024 Refactor Intervention View to dedicated Grid Component'
  - '[ ] 8025 Create Custom Theme: Neo Cyberpunk'
  - '[x] 8031 Fix Grid Header Button Border on Hover'
  - '[x] 8032 Add Glow and Transition to Cyberpunk Grid Header Buttons'
  - '[x] 8033 Create InterventionPanel.scss and Fix Selection Contrast'
  - '[x] 8034 Migrate Intervention Panel Styles and Clean Viewport SCSS'
  - '[x] 8035 Refine Visual Alignment and Button Typography'
  - '[x] 8036 Increase Toolbar Padding to 20px'
subIssuesCompleted: 14
subIssuesTotal: 18
blockedBy: []
blocking: []
---
# Epic: Neo Command Center (Agent OS UI)

This epic covers Phase 3 of the Agent OS Roadmap: building the "Killer App" that visualizes and controls the agent swarm. This will be a multi-window Neo.mjs application serving as the "God View" for the digital organization.

## Goals
1.  **Visual Orchestration:** Provide a spatial interface to see active agents, tasks, and status.
2.  **Derailment Recovery:** Enable "Human-in-the-Loop" intervention when agents get blocked.
3.  **Dogfooding:** Build the interface using the Neo.mjs framework itself, demonstrating its multi-window capabilities.

## Key Deliverables
1.  **Dashboard Layout:** A multi-window workspace design (Strategy, Swarm, Intervention).
2.  **Real-time Visualization:** A "Blackboard" component that renders the state of the GitHub Issue swarm.
3.  **Intervention UI:** A chat-like interface to guide stuck agents.


## Timeline

- 2025-11-29T15:17:50Z @tobiu added the `epic` label
- 2025-11-29T15:17:51Z @tobiu added the `ai` label
- 2025-11-29T15:19:19Z @tobiu cross-referenced by #7920
- 2025-11-29T15:21:37Z @tobiu added sub-issue #7920
- 2025-11-29T15:22:15Z @tobiu added sub-issue #7921
- 2025-11-29T15:22:17Z @tobiu added sub-issue #7922
- 2025-11-30T18:37:29Z @tobiu assigned to @tobiu
- 2025-11-30T18:39:06Z @tobiu cross-referenced by #7954
- 2025-11-30T18:39:14Z @tobiu added sub-issue #7954
- 2025-11-30T18:42:48Z @tobiu added sub-issue #7955
- 2025-11-30T21:00:40Z @tobiu added sub-issue #7956
- 2025-12-04T01:15:15Z @tobiu added sub-issue #8018
- 2025-12-04T01:30:57Z @tobiu added sub-issue #8019
- 2025-12-04T03:45:00Z @tobiu added sub-issue #8021
- 2025-12-04T03:45:20Z @tobiu added sub-issue #8022
- 2025-12-04T22:49:12Z @tobiu added sub-issue #8024
- 2025-12-04T23:37:38Z @tobiu added sub-issue #8025
- 2025-12-05T01:02:11Z @tobiu added sub-issue #8031
- 2025-12-05T02:07:50Z @tobiu added sub-issue #8032
- 2025-12-05T02:19:06Z @tobiu added sub-issue #8033
- 2025-12-05T02:43:35Z @tobiu added sub-issue #8034
- 2025-12-05T03:03:15Z @tobiu added sub-issue #8035
- 2025-12-05T03:28:07Z @tobiu added sub-issue #8036

