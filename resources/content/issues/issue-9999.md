---
id: 9999
title: '[Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-14T15:09:09Z'
updatedAt: '2026-04-14T15:09:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9999'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[ ] 10000 Hardened Identity Ingestion & Tenant Isolation'
  - '[ ] 10001 Dynamic Topology: Unified vs. Federated Routing'
  - '[ ] 10002 Universal Macro Overlay DB Topology'
  - '[ ] 10003 Standardize Global Vector Embedding Configuration'
  - '[ ] 10004 DreamService: Omnidirectional Gap Inference Engine'
  - '[ ] 10006 DreamService: Semantic Edge Injection into Native Graph'
  - '[ ] 10007 Memory Core: Bypass Database Initialization in Unified Mode'
  - '[ ] 10008 Playwright Test Coverage: Unified Monolithic Topology'
  - '[ ] 10009 Playwright Test Coverage: Federated Cloud Topology'
  - '[ ] 10010 Memory Core: Team vs Private Context Retrieval Flag'
  - '[ ] 10011 Native Edge Graph (SQLite): Row-Level Security & Tenant Isolation'
  - '[ ] 10012 DreamService: Federated Execution Batching & Throttling'
subIssuesCompleted: 0
subIssuesTotal: 12
blockedBy: []
blocking: []
---
# [Epic] Cloud-Native Knowledge & Multi-Tenant Memory Core

# Architectural Goal
Transition the Agent OS to a scalable, multi-tenant Hybrid GraphRAG architecture that enforces strict data privacy while enabling autonomous Universal Macro Overlay detection.

## The Strategy
To support both rapid local development and scalable enterprise clusters, we are adopting a Dynamic Configured Topology:
1. **Dynamic Topography**: Support for "Unified Local" mode (single ChromaDB instance) and "Federated Cloud" mode (isolated Knowledge Base and Memory Core instances).
2. **Hardened Identity Ingestion**: Support Multi-Tenant isolation by reliably extracting user identities via reverse-proxy HTTP headers (e.g., `x-auth-request-preferred-username`). All memories and sessions are tagged with `userId` natively in ChromaDB metadata.
3. **Universal Macro DB Topology**: The Knowledge Base will ingest a secondary, unchunked `neo-knowledge-base-macro` index containing 1:1 embeddings for all artifacts (Guides, Source, PRs, Tickets, etc.).
4. **Omnidirectional Semantic Distance**: `DreamService` will execute federated REST queries against the Macro DB to mathematically map gaps across the entire project (e.g. mapping tickets to impacted source code, mapping missing guides to new components). 

*Note: Implementation phases will be tracked via native Sub-Issues linked to this Epic.*

## Timeline

- 2026-04-14T15:09:10Z @tobiu added the `epic` label
- 2026-04-14T15:09:10Z @tobiu added the `ai` label
- 2026-04-14T15:09:10Z @tobiu added the `architecture` label
- 2026-04-14T15:09:40Z @tobiu assigned to @tobiu
- 2026-04-14T15:11:06Z @tobiu added sub-issue #10000
- 2026-04-14T15:11:07Z @tobiu added sub-issue #10001
- 2026-04-14T15:11:09Z @tobiu added sub-issue #10002
- 2026-04-14T15:13:05Z @tobiu added sub-issue #10003
- 2026-04-14T15:13:06Z @tobiu added sub-issue #10004
- 2026-04-14T15:13:08Z @tobiu added sub-issue #10005
- 2026-04-14T15:16:32Z @tobiu added sub-issue #10006
- 2026-04-14T15:18:28Z @tobiu added sub-issue #10007
- 2026-04-14T15:18:30Z @tobiu added sub-issue #10008
- 2026-04-14T15:18:31Z @tobiu added sub-issue #10009
- 2026-04-14T15:18:32Z @tobiu removed sub-issue #10005
- 2026-04-14T15:19:44Z @tobiu added sub-issue #10010
- 2026-04-14T15:22:01Z @tobiu added sub-issue #10011
- 2026-04-14T15:22:03Z @tobiu added sub-issue #10012

