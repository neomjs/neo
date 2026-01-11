---
id: 7851
title: 'Documentation: Create Guide for "The Memory Core Server"'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-22T08:15:21Z'
updatedAt: '2025-11-22T08:32:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7851'
author: tobiu
commentsCount: 0
parentIssue: 7848
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-22T08:32:03Z'
---
# Documentation: Create Guide for "The Memory Core Server"

Create a new guide `learn/guides/mcp/MemoryCore.md` detailing the agent's persistent memory system.

**Content Requirements:**
*   **Purpose:** Explain the need for long-term agent memory and learning.
*   **The "Save-Then-Respond" Protocol:** Detail the transactional requirement for every turn.
*   **Session Summarization:** Explain how the server automatically discovers and summarizes past sessions on startup.
*   **Querying:** Explain the difference between `query_raw_memories` and `query_summaries`.
*   **Update `learn/tree.json`:** Add this new node to the navigation tree.

## Timeline

- 2025-11-22T08:15:23Z @tobiu added the `documentation` label
- 2025-11-22T08:15:23Z @tobiu added the `enhancement` label
- 2025-11-22T08:15:23Z @tobiu added the `ai` label
- 2025-11-22T08:15:24Z @tobiu added parent issue #7848
- 2025-11-22T08:31:36Z @tobiu assigned to @tobiu
- 2025-11-22T08:31:55Z @tobiu referenced in commit `6106042` - "Documentation: Create Guide for "The Memory Core Server" #7851"
- 2025-11-22T08:32:03Z @tobiu closed this issue

