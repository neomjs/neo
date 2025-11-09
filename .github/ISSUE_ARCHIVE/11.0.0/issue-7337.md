---
id: 7337
title: >-
  Enhance Agent Session Initialization: Generate New Session ID and Validate
  Memory Core State
state: CLOSED
labels:
  - bug
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T11:56:41Z'
updatedAt: '2025-10-04T13:26:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7337'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-03T12:05:58Z'
---
# Enhance Agent Session Initialization: Generate New Session ID and Validate Memory Core State

**Reported by:** @tobiu on 2025-10-03

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

The current agent session initialization protocol in `.github/AGENTS.md` has a critical flaw: it does not explicitly instruct the agent to generate a *new* `sessionId` at the start of each memory-enabled session. This leads to attempts to reuse old session IDs, add memories to already summarized sessions, and creates an inconsistent and unreliable memory state.

This ticket aims to rectify this by enhancing the session initialization process to ensure a proper, distinct `sessionId` is generated and the memory core's state is correctly validated before any memory operations occur.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to include a clear step in the "Session Initialization" sequence (Step 2) that mandates the generation of a new, unique `sessionId` for each new memory-enabled session.
2.  The new `sessionId` must be generated *before* any memory-related operations (e.g., saving the first message, summarizing previous sessions).
3.  The protocol must explicitly state that once a session has been summarized, it is considered immutable, and no further memories should be added to it.
4.  The agent's internal logic for initiating a session must reflect these changes, ensuring a new `sessionId` is always used for new sessions when the memory core is active.
5.  The agent should be able to correctly identify and use the *current* session's ID for all memory operations within that session.

