---
id: 7529
title: 'Epic: Implement Agent-Managed Database Tools'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T12:45:43Z'
updatedAt: '2025-10-17T13:26:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7529'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7530 Add Database Management Tools to Knowledge Base Server'
  - '[x] 7531 Add Database Management Tools to Memory Core Server'
  - '[x] 7532 Make start_database Hybrid-Aware'
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2025-10-17T13:26:36Z'
---
# Epic: Implement Agent-Managed Database Tools

Enhance the `knowledge-base` and `memory-core` MCP servers with tools that allow an AI agent to start and stop their respective ChromaDB instances. The servers will still connect to pre-existing databases if available, but will now provide the agent with the capability to manage the database lifecycle itself. This hybrid approach offers maximum flexibility for both developers and agents.

## Top-Level Items

- `ticket-kb-add-db-tools.md`: Add `start/stop_database` tools to the Knowledge Base server.
- `ticket-mc-add-db-tools.md`: Add `start/stop_database` tools to the Memory Core server.
- `ticket-kb-make-start-hybrid-aware.md`: Make the `start_database` tool hybrid-aware.

## Timeline

- 2025-10-17T12:45:43Z @tobiu assigned to @tobiu
- 2025-10-17T12:45:44Z @tobiu added the `epic` label
- 2025-10-17T12:45:44Z @tobiu added the `ai` label
- 2025-10-17T12:46:45Z @tobiu added sub-issue #7530
- 2025-10-17T12:47:49Z @tobiu added sub-issue #7531
- 2025-10-17T12:48:36Z @tobiu referenced in commit `515c8de` - "#7529 ticket md files"
- 2025-10-17T13:03:35Z @tobiu added sub-issue #7532
- 2025-10-17T13:26:36Z @tobiu closed this issue

