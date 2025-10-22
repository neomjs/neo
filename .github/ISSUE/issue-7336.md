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
closedAt: '2025-10-03T11:17:34Z'
---
# Implement Automated Session Summarization Workflow

**Reported by:** @tobiu on 2025-10-03

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

To improve context and continuity between sessions, the agent's startup protocol needs to be enhanced. When a new session starts with the memory core enabled, the agent should automatically summarize the work of the *previous* session.

This creates a virtuous cycle where the end of one session's work becomes the starting context for the next.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to include a new step in the "Session Initialization" sequence.
2.  This new step instructs the agent to, if the memory core is active, find the `sessionId` of the most recent previous session.
3.  If a previous session ID is found, the agent must execute `npm run ai:summarize-session` on that ID.
4.  This step should be positioned after the memory core check in the initialization process.

