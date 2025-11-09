---
id: 7334
title: Document Human Verification of Agent Memory
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T10:15:51Z'
updatedAt: '2025-10-03T10:17:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7334'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-03T10:17:41Z'
---
# Document Human Verification of Agent Memory

**Reported by:** @tobiu on 2025-10-03

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

To ensure the integrity of the agent's memory core, this ticket covers updating the `.github/WORKING_WITH_AGENTS.md` guide to instruct human developers on their role in the memory-saving process.

While the agent is mandated to follow a "save-then-respond" protocol, a sufficiently derailed agent might fail to do so. This update introduces the concept of a "human-in-the-loop" safeguard for the memory protocol itself.

## Acceptance Criteria

1.  A new section, titled **"The Memory Core: A Shared Responsibility"**, is added to `.github/WORKING_WITH_AGENTS.md`.
2.  This section explains the agent's "save-then-respond" duty.
3.  This section explicitly defines the human developer's duty to verify that the `ai:add-memory` tool call is successfully made after every agent turn when the memory core is active.
4.  The section provides a clear recovery prompt for the user to issue in case the agent fails to save its memory.

