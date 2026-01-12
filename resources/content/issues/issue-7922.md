---
id: 7922
title: 'Feat: ''Derailment'' Intervention Interface'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-11-29T15:19:23Z'
updatedAt: '2025-11-29T15:19:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7922'
author: tobiu
commentsCount: 0
parentIssue: 7918
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: 'Derailment' Intervention Interface

# Feat: 'Derailment' Intervention Interface

## Context
When an agent sets its status to `agent-task:blocked`, the system must alert the human operator. This ticket covers the UI for that intervention.

## Requirements
1.  **Alerting:** Visual notification in the Command Center when an agent blocks.
2.  **Context View:** Display the agent's last known state:
    *   The Issue it was working on.
    *   The last 5 "Thoughts" or log entries.
    *   The error message that caused the block.
3.  **Interaction:** A chat input where the human can provides new instructions.
4.  **Resolution:** A "Resume" button that updates the GitHub Issue with the human's feedback and clears the `blocked` label.

## Output
*   A functional "Intervention Panel" component in the Command Center app.


## Timeline

- 2025-11-29T15:19:25Z @tobiu added the `enhancement` label
- 2025-11-29T15:19:25Z @tobiu added the `ai` label
- 2025-11-29T15:22:17Z @tobiu added parent issue #7918

