---
id: 8199
title: '[Process] Update AGENTS_STARTUP.md to mandate reading recent session summaries'
state: CLOSED
labels:
  - documentation
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T05:31:02Z'
updatedAt: '2025-12-29T05:36:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8199'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T05:36:43Z'
---
# [Process] Update AGENTS_STARTUP.md to mandate reading recent session summaries

Based on recent analysis, reading recent session summaries provides critical "institutional memory," preventing regression and aligning strategic context.

**Requirement:**
Update `AGENTS_STARTUP.md` (specifically Section 6: Check for Memory Core) to:
1.  **Mandate** that agents execute `get_all_summaries({ limit: 5 })` if the Memory Core healthcheck is successful.
2.  **Explain the value**: Explicitly state that this establishes continuity and helps identify recent failures or architectural decisions.
3.  **Encourage Drill-Down**: Add a note that agents can and should use `get_session_memories` to investigate specific sessions if a summary indicates relevant details (e.g., a "failed" session or complex refactor).

**Success Criteria:**
- `AGENTS_STARTUP.md` clearly instructs agents to perform this action during initialization.
- The instruction is framed as a mandatory step for "Memory Core Active" scenarios.

## Timeline

- 2025-12-29T05:31:03Z @tobiu added the `documentation` label
- 2025-12-29T05:31:04Z @tobiu added the `developer-experience` label
- 2025-12-29T05:31:04Z @tobiu added the `ai` label
- 2025-12-29T05:36:14Z @tobiu assigned to @tobiu
- 2025-12-29T05:36:34Z @tobiu referenced in commit `04b85eb` - "[Process] Update AGENTS_STARTUP.md to mandate reading recent session summaries #8199"
- 2025-12-29T05:36:43Z @tobiu closed this issue

