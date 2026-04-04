---
id: 9673
title: 'Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-03T23:59:50Z'
updatedAt: '2026-04-04T01:18:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9673'
author: tobiu
commentsCount: 0
parentIssue: 9671
subIssues:
  - '[x] 9676 Implement Native Edge Graph Database Engine'
  - '[x] 9677 Epic Sub: Enhance Neo.collection.Base with Secondary Lookup Indices'
  - '[x] 9678 Native Graph Database SQLite Persistence Adapter'
  - '[x] 9679 Optimize V8 graph array operations via native slice topologies'
  - '[ ] 9680 Native Edge Graph: Distributed Caching & Lazy Loading'
  - '[ ] 9681 Native Edge Graph: ACID Transaction Control Pipeline'
  - '[x] 9682 Native Edge Graph: Traversal Query Engine & Aggregations'
subIssuesCompleted: 5
subIssuesTotal: 7
blockedBy: []
blocking: []
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
   - Parse the Neo.mjs class hierarchy, declarative configs, reactive hooks, and component dependencies.
   - Feed this framework topology automatically into the Native Graph.
   - Expose MCP server endpoints so the AI can traverse this graph dynamically to gain precise architectural awareness.

## Definition of Done
- A zero-dependency JS Graph DB module is functional and integrated into the overarching server architecture.
- The Neo.mjs framework hierarchy (The Public Context) is actively mapped into this graph.
- Agents can query the graph (e.g., "What are the children of this class?" or "What hooks does this node trigger?") and receive deterministic answers.

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

