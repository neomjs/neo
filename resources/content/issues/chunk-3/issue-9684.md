---
id: 9684
title: 'Epic: AI - The "Strategic Co-Founder" Orchestrator (Sub-Epic of #9671)'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T12:04:52Z'
updatedAt: '2026-04-04T12:13:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9684'
author: tobiu
commentsCount: 1
parentIssue: 9671
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T12:13:19Z'
---
# Epic: AI - The "Strategic Co-Founder" Orchestrator (Sub-Epic of #9671)

## Problem / Context
We have established a Native Knowledge Graph and bridged it to our ChromaDB semantic vectors to cure "Session Amnesia" via the Context Priming Engine (GraphRAG Hybrid).
However, the `[Frontier]` node—which dictates the agent's startup context—is currently static.

## Proposed Solution
We need an orchestration layer: the "Strategic Co-Founder" (Librarian/Coordinator Sub-Agent).
This orchestration layer will actively manage the `[Frontier]` node. When project priorities pivot (e.g. from optimizing the Graph Database to building out Next.js UI), this sub-agent will inject those new priorities into the Graph's Edge relationships in real-time.

1. **Frontier Mutations:** Agents will have the capability to query and alter the `[Frontier]` node weights.
2. **Sub-Agent Delegation:** Establish a "Librarian" protocol to orchestrate shifting project contexts.
3. **Cross-Session Coherence:** Ensure that pivots executed in one session immediately influence the initialization of the next via `get_context_frontier()`.

## Timeline

- 2026-04-04T12:04:53Z @tobiu added the `epic` label
- 2026-04-04T12:04:54Z @tobiu added the `ai` label
- 2026-04-04T12:04:54Z @tobiu added the `architecture` label
- 2026-04-04T12:07:55Z @tobiu added parent issue #9671
- 2026-04-04T12:08:48Z @tobiu assigned to @tobiu
- 2026-04-04T12:12:26Z @tobiu referenced in commit `fdf7407` - "docs: Add Strategic Co-Founder Protocol to AGENTS.md (#9684)

- Mandates the use of mutate_frontier tool when the user pivots context.
- Maintains dynamic alignment in Native Graph topology for agent orchestration."
### @tobiu - 2026-04-04T12:13:17Z

**Input from Gemini 2.5 Pro (Antigravity):**

> ✦ The "Strategic Co-Founder" Orchestrator infrastructure is complete.
> 
> 1. Implemented native `mutateFrontier` capabilities in GraphService and MemoryService.
> 2. Exposed `mutate_frontier` as an MCP tool for agent use.
> 3. Added the "Strategic Co-Founder Protocol" to `AGENTS.md` (Section 5) which legally mandates agents to update the `[Frontier]` node whenever the human user explicitly pivots the task domain.
> 
> The core infrastructure for orchestrating strategic direction is live. Further Librarian workflows may be introduced as needed.

- 2026-04-04T12:13:19Z @tobiu closed this issue

