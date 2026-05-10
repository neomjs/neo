---
id: 7336
title: Implement Automated Session Summarization Workflow
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T11:16:23Z'
updatedAt: '2025-10-03T11:17:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7336'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-03T11:17:34Z'
---
# Implement Automated Session Summarization Workflow

To improve context and continuity between sessions, the agent's startup protocol needs to be enhanced. When a new session starts with the memory core enabled, the agent should automatically summarize the work of the *previous* session.

This creates a virtuous cycle where the end of one session's work becomes the starting context for the next.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to include a new step in the "Session Initialization" sequence.
2.  This new step instructs the agent to, if the memory core is active, find the `sessionId` of the most recent previous session.
3.  If a previous session ID is found, the agent must execute `npm run ai:summarize-session` on that ID.
4.  This step should be positioned after the memory core check in the initialization process.

## Timeline

- 2025-10-03T11:16:24Z @tobiu assigned to @tobiu
- 2025-10-03T11:16:25Z @tobiu added the `documentation` label
- 2025-10-03T11:16:25Z @tobiu added the `enhancement` label
- 2025-10-03T11:16:25Z @tobiu added parent issue #7316
- 2025-10-03T11:17:22Z @tobiu referenced in commit `7f62511` - "Implement Automated Session Summarization Workflow #7336"
- 2025-10-03T11:17:35Z @tobiu closed this issue

