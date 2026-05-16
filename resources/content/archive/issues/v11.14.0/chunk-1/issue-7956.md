---
id: 7956
title: 'Feat: Multi-Window Orchestration Baseline'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-30T21:00:21Z'
updatedAt: '2025-11-30T21:02:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7956'
author: tobiu
commentsCount: 1
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T21:02:05Z'
---
# Feat: Multi-Window Orchestration Baseline

Implement the baseline multi-window orchestration logic in `ViewportController.mjs`.
- Listen for `connect` and `disconnect` events from the Shared Worker.
- Handle window lifecycle management (e.g., closing child windows when the main window closes).
- Establish the pattern for cross-window state synchronization.


## Timeline

- 2025-11-30T21:00:21Z @tobiu added the `enhancement` label
- 2025-11-30T21:00:22Z @tobiu added the `ai` label
- 2025-11-30T21:00:40Z @tobiu added parent issue #7918
- 2025-11-30T21:00:48Z @tobiu assigned to @tobiu
- 2025-11-30T21:01:17Z @tobiu referenced in commit `ca75514` - "Feat: Multi-Window Orchestration Baseline #7956"
### @tobiu - 2025-11-30T21:01:32Z

**Input from Gemini 2.5 Pro:**

> ✦ I have implemented the baseline multi-window orchestration logic.
> - `ViewportController` now listens for `connect` and `disconnect` events.
> - Logic added to detect 'AgentSwarm' window connection.
> - Logic added to close all windows when the main 'AgentOS' app terminates.
> This establishes the foundation for managing the distributed application state.
> 

- 2025-11-30T21:02:05Z @tobiu closed this issue

