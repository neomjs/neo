---
id: 9638
title: 'Epic: Architecture - Neo.mjs Dream Mode & GraphRAG Swarm'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T10:42:53Z'
updatedAt: '2026-04-04T00:04:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9638'
author: tobiu
commentsCount: 1
parentIssue: 9671
subIssues:
  - '[x] 9639 Local LLM Provider Adapter (Ollama + Gemma-4)'
  - '[x] 9640 Knowledge Graph Database Backend (Neocortex)'
  - '[x] 9641 The "Night Shift" REM Pipeline (Hippocampus)'
  - '[x] 9642 Unified GraphRAG MCP Interface'
  - '[x] 9643 "Librarian" Sub-Agent Orchestration'
  - '[x] 9658 Enhance Memory-Core for explicit Gemma4 offline session summarization'
  - '[x] 9659 Enhance Memory Core with Agent and Model Traceability'
  - '[x] 9660 Native MCP Tool Execution inside Loop.mjs'
  - '[x] 9661 Phase 2: Autonomous Sub-Agent Delegation (Dream Mode)'
  - '[x] 9662 Dream Mode Phase 3: GraphRAG Topology & REM Mode Orchestration'
  - '[x] 9665 Stabilize MCP Server Infrastructure & Fix Memory/Graph Regression'
  - '[x] 9666 Epic: Migrate Knowledge Graph to Memory Core'
subIssuesCompleted: 12
subIssuesTotal: 12
blockedBy: []
blocking: []
closedAt: '2026-04-04T00:04:16Z'
---
# Epic: Architecture - Neo.mjs Dream Mode & GraphRAG Swarm

## Problem / Context
The current Neo.mjs `memory-core` relies on flat vector embeddings (ChromaDB) for session summaries, which limits the agent's ability to reason about topological relationships, bug resolutions, and temporal connections. 

To create a massive "performance multiplier", we need to introduce an asynchronous local LLM pipeline ("Dream Mode" powered by Gemma-4) that digests session episodic memories and constructs a definitive Knowledge Graph (the "Neocortex").

## Proposed Solution (Hippocampus/Neocortex Architecture)
This epic coordinates the upgrade of the Neo.mjs AI infrastructure into a GraphRAG Swarm. The workloads are split contextually:
1. **The Neocortex (`knowledge-base` server):** Will host the unified SQLite Graph Database mapping both dynamic experiences and static AST relations.
2. **The Hippocampus (`memory-core` server):** Will host the "Night Shift" Dream Pipeline that leverages local Gemma-4 agents to extract lessons/patterns from episodic session memory and upsert them into the Neocortex graph.

## Sub-Tasks
*   **Epic 1:** Local LLM Provider Adapter (`Neo.ai.provider.Ollama` targeted for `gemma-4-31b-it`).
*   **Epic 2:** Knowledge Graph Backend (`GraphService.mjs` inside `knowledge-base`).
*   **Epic 3:** The "Night Shift" REM Pipeline (`DreamService.mjs` inside `memory-core`).
*   **Epic 4:** Unified GraphRAG MCP Interface (New endpoints and `query_knowledge_graph` tool).
*   **Epic 5:** "Librarian" Sub-Agent Orchestration (Cross-agent task delegation in `Agent.mjs`).

## Timeline

- 2026-04-03T10:42:54Z @tobiu added the `epic` label
- 2026-04-03T10:42:54Z @tobiu added the `ai` label
- 2026-04-03T10:42:54Z @tobiu added the `architecture` label
- 2026-04-03T10:44:44Z @tobiu cross-referenced by #9639
- 2026-04-03T10:44:47Z @tobiu cross-referenced by #9642
- 2026-04-03T10:44:48Z @tobiu cross-referenced by #9643
- 2026-04-03T10:44:48Z @tobiu cross-referenced by #9641
- 2026-04-03T10:44:48Z @tobiu cross-referenced by #9640
- 2026-04-03T10:44:57Z @tobiu added sub-issue #9639
- 2026-04-03T10:44:58Z @tobiu added sub-issue #9640
- 2026-04-03T10:44:58Z @tobiu added sub-issue #9641
- 2026-04-03T10:44:59Z @tobiu added sub-issue #9642
- 2026-04-03T10:45:00Z @tobiu added sub-issue #9643
- 2026-04-03T10:47:12Z @tobiu assigned to @tobiu
- 2026-04-03T13:48:45Z @tobiu added sub-issue #9658
- 2026-04-03T14:01:19Z @tobiu added sub-issue #9659
- 2026-04-03T14:15:33Z @tobiu cross-referenced by #9660
- 2026-04-03T14:15:40Z @tobiu added sub-issue #9660
- 2026-04-03T14:27:27Z @tobiu added sub-issue #9661
- 2026-04-03T14:46:31Z @tobiu cross-referenced by #9662
- 2026-04-03T14:46:38Z @tobiu added sub-issue #9662
- 2026-04-03T18:37:56Z @tobiu added sub-issue #9665
- 2026-04-03T21:44:10Z @tobiu added sub-issue #9666
- 2026-04-03T23:49:23Z @tobiu added parent issue #9671
### @tobiu - 2026-04-04T00:04:16Z

Superseded by the new Masterplan Epic #9671.

- 2026-04-04T00:04:16Z @tobiu closed this issue

