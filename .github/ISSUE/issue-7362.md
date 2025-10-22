---
id: 7362
title: Correct Agent Initialization Workflow
state: CLOSED
labels:
  - bug
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-10-05T09:50:51Z'
updatedAt: '2025-10-05T09:55:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7362'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-05T09:55:30Z'
---
# Correct Agent Initialization Workflow

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

The agent's session initialization workflow had a logical flaw. It was saving the new session's first memory *before* summarizing previous sessions, causing the new session to be summarized prematurely. This ticket documents the correction of that workflow.

## Acceptance Criteria

1.  The agent's internal workflow is updated to first summarize all un-summarized sessions.
2.  Only after summarization is complete does the agent save the initial memory for the new session.
3.  The agent has persisted this corrected workflow to its long-term memory to ensure it is followed in all future sessions.

