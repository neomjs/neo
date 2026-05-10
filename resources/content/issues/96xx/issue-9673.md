---
id: 9673
title: 'Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T23:59:50Z'
updatedAt: '2026-04-09T08:11:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9673'
author: tobiu
commentsCount: 1
parentIssue: 9671
subIssues:
  - '[x] 9676 Implement Native Edge Graph Database Engine'
  - '[x] 9677 Epic Sub: Enhance Neo.collection.Base with Secondary Lookup Indices'
  - '[x] 9678 Native Graph Database SQLite Persistence Adapter'
  - '[x] 9679 Optimize V8 graph array operations via native slice topologies'
  - '[x] 9680 Native Edge Graph: Distributed Caching & Lazy Loading'
  - '[x] 9681 Native Edge Graph: ACID Transaction Control Pipeline'
  - '[x] 9682 Native Edge Graph: Traversal Query Engine & Aggregations'
  - '[x] 9683 Epic Sub: Session Amnesia & The Context Priming Engine'
  - '[x] 9697 Fix: GraphService direct lookups fail on Lazy Loading cache misses'
  - '[x] 9707 [Handoff Protocol] Agent Startup Reconciliation & Graph Mutation'
  - '[x] 9708 [Topographical Extraction] Sandman REM Actionable Alert Generation'
  - '[x] 9709 [Vector Bridge] Stitching Chroma Semantics to SQLite Edge Nodes'
  - '[x] 9710 [SQLite VSS Migration] 100% Offline Markdown Tensor Chunking'
  - '[x] 9714 [Sandman] Hybrid GraphRAG Scoring Algorithm'
subIssuesCompleted: 14
subIssuesTotal: 14
blockedBy: []
blocking: []
closedAt: '2026-04-09T08:11:04Z'
---
# Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)

## Problem
While our current semantic vector database (ChromaDB) successfully handles unstructured deep-dive semantic searches across memories and the knowledge base, it lacks relational topology. The AI lacks structural intuition (e.g., knowing the exact inheritance chain from `Neo.grid.View` → `Neo.component.Base` → `vnode hooks`).

## Proposed Solution
Pivot to a true **Hybrid GraphRAG Model**. 
- **Retain ChromaDB** for its high-performance semantic vector search.
- **Build the Native Neo Graph DB** specifically to store relational topologies (edges) that sit *alongside* Chroma.

## Requirements
1. **Native Graph Database Engine:** 
   - Build a zero-dependency JS Graph Database that sits alongside ChromaDB.
   - Design lightweight node/edge relationship schemas in a purely JS environment to explicitly connect vector chunks (Graph Layer interacting with Semantic Layer).
2. **Application Engine Knowledge Graph Mapping:** 
   - **(Deprecation Update):** We will *not* build a standalone static AST class hierarchy ingestor. Instead, the AI will rely on the `neo-mjs-neural-link` MCP server for powerful runtime scene inspections and the `neo-mjs-knowledge-base` MCP for static relationship querying.
   - The Native Edge graph should instead focus exclusively on topological relationships mapping external concepts (File System structure, Agent Memories, GitHub Epics, Boardroom KPIs).
   - Expose MCP server endpoints so the AI can traverse this graph dynamically to gain architectural awareness.

## Definition of Done
- A zero-dependency JS Graph DB module is functional and integrated into the overarching server architecture.
- A functional `FileSystemIngestor` natively injects code architecture anchors into the graph.
- Agents can query the graph and receive deterministic answers.

## Timeline

- 2026-04-03T23:59:52Z @tobiu added the `epic` label
- 2026-04-03T23:59:52Z @tobiu added the `ai` label
- 2026-04-03T23:59:52Z @tobiu added the `architecture` label
- 2026-04-03T23:59:58Z @tobiu added parent issue #9671
- 2026-04-04T00:02:14Z @tobiu cross-referenced by #9674
- 2026-04-04T00:04:15Z @tobiu cross-referenced by #9662
- 2026-04-04T00:37:43Z @tobiu added sub-issue #9676
- 2026-04-04T01:03:47Z @tobiu added sub-issue #9677
- 2026-04-04T01:18:06Z @tobiu added sub-issue #9678
- 2026-04-04T01:18:24Z @tobiu assigned to @tobiu
- 2026-04-04T01:38:24Z @tobiu added sub-issue #9679
- 2026-04-04T01:42:52Z @tobiu added sub-issue #9680
- 2026-04-04T01:42:53Z @tobiu added sub-issue #9681
- 2026-04-04T01:42:54Z @tobiu added sub-issue #9682
- 2026-04-04T11:39:49Z @tobiu added sub-issue #9683
- 2026-04-04T16:13:04Z @tobiu cross-referenced by #9697
- 2026-04-04T16:13:15Z @tobiu added sub-issue #9697
- 2026-04-04T21:05:09Z @tobiu cross-referenced by #9707
- 2026-04-04T21:05:21Z @tobiu cross-referenced by #9708
- 2026-04-04T21:05:26Z @tobiu cross-referenced by #9709
- 2026-04-04T21:05:33Z @tobiu cross-referenced by #9710
- 2026-04-04T21:05:41Z @tobiu added sub-issue #9707
- 2026-04-04T21:05:42Z @tobiu added sub-issue #9708
- 2026-04-04T21:05:43Z @tobiu added sub-issue #9709
- 2026-04-04T21:05:44Z @tobiu added sub-issue #9710
- 2026-04-05T00:44:18Z @tobiu cross-referenced by #9714
- 2026-04-05T00:44:25Z @tobiu added sub-issue #9714
### @tobiu - 2026-04-09T08:11:03Z

Closing epic as primary phase is structurally resolved and Native Graph DB is active. We are formalizing Phase 2 for Tuning and Deterministic Capabilities.

- 2026-04-09T08:11:04Z @tobiu closed this issue
- 2026-04-09T08:11:46Z @tobiu cross-referenced by #9803

