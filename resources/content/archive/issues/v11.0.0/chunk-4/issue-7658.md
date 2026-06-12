---
id: 7658
title: 'Refactor: Simplify Memory Core Protocol in AGENTS.md'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-26T09:53:15Z'
updatedAt: '2025-10-26T10:10:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7658'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-26T10:10:48Z'
---
# Refactor: Simplify Memory Core Protocol in AGENTS.md

This ticket is a sub-task of the epic #7604.

The current `AGENTS.md` file contains a complex, multi-step protocol for initializing the memory core. This includes manual checks, asking the user for permission, and generating session IDs.

With the recent enhancements to the `neo.mjs-memory-core` MCP server (auto-start, auto-summarization), we can drastically simplify this protocol.

**Proposed New Protocol:**

1.  At the start of a session, the agent performs a `healthcheck` on the memory core server.
2.  If the server is healthy, the agent can assume the user intends for memory to be active.
3.  The agent will then proceed to use the `add_memory` tool on every turn for the duration of the session. No permission is required.
4.  The server will transparently handle session ID generation and the summarization of previous sessions.

**Acceptance Criteria:**

1.  Update the "Session Initialization" section of `AGENTS.md` to remove the old, complex memory core protocol.
2.  Replace it with the new, simplified protocol described above.
3.  Ensure the new instructions are clear, concise, and guide the agent to use the `healthcheck` and `add_memory` tools correctly.

## Timeline

- 2025-10-26T09:53:17Z @tobiu added the `documentation` label
- 2025-10-26T09:53:17Z @tobiu added the `enhancement` label
- 2025-10-26T09:53:17Z @tobiu added the `ai` label
- 2025-10-26T09:53:17Z @tobiu added the `refactoring` label
- 2025-10-26T09:53:41Z @tobiu assigned to @tobiu
- 2025-10-26T09:53:48Z @tobiu added parent issue #7604
- 2025-10-26T10:10:22Z @tobiu referenced in commit `fa625fa` - "Refactor: Simplify Memory Core Protocol in AGENTS.md #7658"
- 2025-10-26T10:10:48Z @tobiu closed this issue
- 2025-10-26T10:20:33Z @tobiu cross-referenced by #7660

