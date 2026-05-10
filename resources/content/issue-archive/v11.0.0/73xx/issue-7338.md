---
id: 7338
title: Implement Session Recovery Protocol in AGENTS.md
state: CLOSED
labels:
  - bug
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T12:13:19Z'
updatedAt: '2025-10-03T12:16:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7338'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-03T12:16:54Z'
---
# Implement Session Recovery Protocol in AGENTS.md

The current memory core protocol relies on a "save-then-respond" transactional model. However, this model can break down due to various factors, such as incorrect tool usage, API errors, or unexpected interruptions in the message-reply flow. When such a breakdown occurs, unpersisted messages can be lost, leading to incomplete session histories and hindering future analysis and learning.

This ticket aims to introduce a robust session recovery protocol within `AGENTS.md`. This protocol will provide clear instructions for the agent on how to handle memory persistence failures, ensuring that all previous messages are added to the memory core in chronological order, thereby preventing data loss and maintaining the integrity of the session history.

## Acceptance Criteria

1.  A new section, "Session Recovery Protocol," is added to `AGENTS.md` (e.g., under "Development Workflow" or as a new top-level section).
2.  This section clearly defines the scenarios that trigger the recovery protocol (e.g., tool errors, API failures, detected gaps in memory).
3.  The protocol instructs the agent to, upon detecting a memory persistence failure or gap, attempt to add all unpersisted previous messages of the current session to the memory core in chronological order.
4.  The protocol should specify how the agent identifies "unpersisted" messages (e.g., by comparing its internal conversation history with what's confirmed in memory).
5.  The protocol should emphasize the importance of this recovery step for maintaining a complete and analyzable session history.
6.  The agent's internal logic must be updated to implement and adhere to this session recovery protocol.

## Timeline

- 2025-10-03T12:13:20Z @tobiu assigned to @tobiu
- 2025-10-03T12:13:21Z @tobiu added the `bug` label
- 2025-10-03T12:13:21Z @tobiu added parent issue #7316
- 2025-10-03T12:13:21Z @tobiu added the `enhancement` label
- 2025-10-03T12:16:39Z @tobiu referenced in commit `b85b2f8` - "Implement Session Recovery Protocol in AGENTS.md #7338"
- 2025-10-03T12:16:54Z @tobiu closed this issue

