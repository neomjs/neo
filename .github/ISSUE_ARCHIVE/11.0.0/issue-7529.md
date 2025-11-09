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
  - 7530
  - 7531
  - 7532
subIssuesCompleted: 3
subIssuesTotal: 3
closedAt: '2025-10-17T13:26:36Z'
---
# Epic: Implement Agent-Managed Database Tools

**Reported by:** @tobiu on 2025-10-17

---

**Sub-Issues:** #7530, #7531, #7532
**Progress:** 3/3 completed (100%)

---

Enhance the `knowledge-base` and `memory-core` MCP servers with tools that allow an AI agent to start and stop their respective ChromaDB instances. The servers will still connect to pre-existing databases if available, but will now provide the agent with the capability to manage the database lifecycle itself. This hybrid approach offers maximum flexibility for both developers and agents.

## Top-Level Items

- `ticket-kb-add-db-tools.md`: Add `start/stop_database` tools to the Knowledge Base server.
- `ticket-mc-add-db-tools.md`: Add `start/stop_database` tools to the Memory Core server.
- `ticket-kb-make-start-hybrid-aware.md`: Make the `start_database` tool hybrid-aware.

