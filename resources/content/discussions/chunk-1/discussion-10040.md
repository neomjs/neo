---
number: 10040
title: '[Architectural Blueprint] Neo Agent OS 3.x: The Hybrid Swarm Broker'
author: tobiu
category: Ideas
createdAt: '2026-04-16T12:27:17Z'
updatedAt: '2026-04-16T12:57:23Z'
closed: false
closedAt: null
routingDispositionSchemaVersion: discussion-routing-disposition.v1
routingDisposition: undetermined
routingDispositionReason: no-authoritative-lifecycle-marker
routingDispositionEvidence: []
contentTrust:
  projected: true
  quarantined: 0
  signals: []
---
> **Author's Note:** This proposal was autonomously synthesized by **Antigravity (Gemini 3.1 Pro)**. It represents the finalized architectural blueprint combining the Services-Based OS with a Multi-Threaded Swarm Broker to securely resolve IDE file-locking crashes.

## The Cognitive Bottleneck (Twin-LSP Bug)
The Agent OS currently suffers from a critical vulnerability natively tied to how modern IDEs operate. Environments like Antigravity spawn dual instances (Workspace vs System scope) of every MCP Server defined in `mcp_config.json`. 

Because our servers currently instantiate heavy database drivers directly (e.g., `neo.ai.services.GraphService`), spawning 8x independent processes creates a catastrophic crash where monolithic engines fight for standard File I/O locks on the exact same SQLite and ChromaDB files.

## The Hybrid Services OS
To resolve this, we must completely decouple the MCP transport layer from our business logic, evolving into a true **Services-Based OS**.

**1. The Hybrid Topography**
By extracting `ai/services/*`, the Agent OS natively supports mapping modules between local and cloud constraints:
- **Cloud-Ready Backends:** The `Knowledge Base` (ChromaDB), `Memory Core` (SQLite Graph), `NL Backend` (Playwright Engine), and `EventRecorder` can scale seamlessly into central Kubernetes clusters.
- **Local-Only Clients:** The `Neural Link Client` (the browser DOM bridge) and `GitHub Workflow` (handling local SSD files) remain rigidly assigned exclusively to local IDE environments.

## The Swarm Broker (Solving the 8x Bug)
When running the full OS locally, the architecture collapses the 8 monolithic IDE servers into Hollow JSON-RPC proxies (<15MB) that hold zero database connections. 

**1. The Detached Child Process**
When the first Thin Wrapper executes, it transparently spawns `ai/daemons/AgentBroker.mjs` natively as a background process. The remaining IDE wrappers safely connect to the domain socket silently. The Broker becomes the sole owner of the database drivers, entirely eliminating the `SQLITE_BUSY` crash.

**2. The Multi-Threaded Swarm (Neo's DNA)**
To prevent the central background Broker from becoming an isolated event-loop bottleneck, it operates explicitly like Neo.mjs's `SharedWorker`. The Broker farms heavy operations (like `DreamPipeline` math and vector aggregations) into isolated Node **Worker Threads** while the main thread instantly routes JSON-RPC chats back to the IDE without ever dropping a heartbeat.

**3. Lifecycle & Concurrency (The Failsafes)**
- **Concurrency Promise Map:** If twin IDE wrappers hit the Broker simultaneously, the Broker uses an internal map to queue initialization safely. The database boots exactly once, neutralizing massive redundant filesystem sync bombs.
- **Reference Teardown:** The Broker natively tracks connection counts. When all the developer's IDE windows close and the client count hits `0`, the detached Daemon gracefully triggers `teardown()`, killing the background Node process and returning RAM to the host machine.

## Epic #9999 Integration: The Stigmergic Boundary
When the Heavy components (`knowledge-base`, `memory-core`) are deployed to a Federated Cloud cluster over SSE, the Daemon adapts seamlessly into a multi-tenant orchestrator:
- **Shared Global Context:** The `Knowledge Base` (Code structure) and the `Native Edge Graph` remain globally accessible. This empowers **Stigmergy** — when Developer A's agent maps an architectural path, Developer B's agent immediately benefits from that expanded global pheromone trail.
- **Private Identity Context:** The Hub intercepts incoming SSE connections to extract a `userId` header. It strictly limits temporal `Memories` and `Sessions` queries within ChromaDB to this specific ID, mathematically guaranteeing chatbot privacy while structurally pooling the Global Swarm Intelligence.
