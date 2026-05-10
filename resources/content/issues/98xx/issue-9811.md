---
id: 9811
title: 'Epic: Enforce Strict Ticket Hygiene & Active Swarm Ingestion'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T09:22:35Z'
updatedAt: '2026-04-09T09:26:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9811'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9812 Enforce Meta Gates and Cascade Definitions in Agent Manuals'
  - '[x] 9813 Refactor Knowledge Base Ingestion to Target Active Swarm State'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:26:06Z'
---
# Epic: Enforce Strict Ticket Hygiene & Active Swarm Ingestion

# Strategic Context
The recent stabilization of the Memory Core GraphRAG pipeline surfaced a strict behavioral gap in how the agent swarm manages topological tracking. Epics were being created and "one-shotted" within a single PR (using markdown checkboxes instead of actual sub-issues), and the Knowledge Base semantic search was disconnected from the actively synced `resources/content` state. Both of these flaws disrupt swarm synchronicity and LLM contextualization.

# Architectural Reality
1. **Agent Operational Mandates (`AGENTS.md`, `AGENTS_STARTUP.md`)**: Lacked structural gating to prevent duplicate item creation or mandate explicit Epic vs. Issue hierarchy constraints.
2. **Knowledge Base Service (`TicketSource.mjs`)**: Hardcoded to parse `.github/ISSUE_ARCHIVE`, completely missing the active GitHub state synced into `resources/content/issues` and `resources/content/discussions`.

# Resolution Plan
Implement the "Gate 0: Deduplication" protocol, strict Epic granularity constraints, and refactor the `neo.mjs-knowledge-base` MCP server to natively extract and embed the live Markdown synced locally from GitHub. Epic contains actionable sub-tasks.

## Timeline

- 2026-04-09T09:22:37Z @tobiu added the `epic` label
- 2026-04-09T09:22:37Z @tobiu added the `ai` label
- 2026-04-09T09:22:37Z @tobiu added the `architecture` label
- 2026-04-09T09:23:17Z @tobiu added sub-issue #9812
- 2026-04-09T09:23:18Z @tobiu added sub-issue #9813
- 2026-04-09T09:25:56Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T09:26:04Z

All sub-issues (#9812, #9813) have been successfully resolved, pushed, and closed natively. The Gate 0 and Epic granularity protocols are active in the agent manuals, and the Knowledge Base now scans live operational resources natively. Epic is complete.

- 2026-04-09T09:26:06Z @tobiu closed this issue

