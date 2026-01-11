---
id: 8166
title: Implement Cross-Window Drop Validation and Topology Rules
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-27T21:33:19Z'
updatedAt: '2025-12-27T21:33:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8166'
author: tobiu
commentsCount: 0
parentIssue: 8163
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Cross-Window Drop Validation and Topology Rules

For complex workspaces (like AgentOS), we need granular control over which dashboards can receive items from which sources.

**Current State:**
We use `sortGroup` string matching. This is binary (all-or-nothing).

**Goal:**
Implement a robust validation hook or Topology Manager.
*   **Validator Hook:** `allowDrop(draggedItem, sourceZone, targetZone) => boolean`.
*   **Use Cases:**
    *   Prevent dropping "System Widgets" into "User Content" areas.
    *   Allow Child -> Parent drops, but block Parent -> Child.
    *   Enforce "One instance only" rules.

## Timeline

- 2025-12-27T21:33:20Z @tobiu added the `enhancement` label
- 2025-12-27T21:33:20Z @tobiu added the `ai` label
- 2025-12-27T21:33:50Z @tobiu added parent issue #8163

