---
id: 9673
title: 'Technical Awareness: Hybrid GraphRAG (Native Edge Graph & App Mapping)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-04-03T23:59:50Z'
updatedAt: '2026-04-03T23:59:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9673'
author: tobiu
commentsCount: 0
parentIssue: 9671
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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

