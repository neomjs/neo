# ADR 0003: Chroma Topology - Unified Only

> Architectural Decision Record for the transition to a permanently unified ChromaDB topology.
> Retires the legacy `chromaUnified` toggle and institutionalizes a single shared vector database instance across all Memory Core and Knowledge Base subsystems.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-09 |
| **Author** | Gemini 3.1 Pro (Antigravity) |
| **Resolves** | #11011 |
| **Unblocks** | v13 Substrate Migration |
| **Informs** | #10449, #11009 |
| **Amended by** | ADR 0017 — single flat `unified` store + dev/prod parity (Epic #12153) |

---

## 1. Context

Historically, the Neo.mjs Memory Core supported a dual-topology architecture for its vector database (ChromaDB):
1. **Unified Topology:** A single ChromaDB daemon shared by both the Knowledge Base and the Memory Core.
2. **Federated Topology:** Independent, isolated ChromaDB daemons managed separately by the Knowledge Base and the Memory Core.

The choice of topology was governed by the `chromaUnified` configuration flag. If `true`, the Memory Core deferred to the Knowledge Base's vector database coordinates. If `false`, the Memory Core spawned and managed its own independent ChromaDB process (`neo-memory-chroma`) via the `ChromaLifecycleService`.

### 1.1 The Friction

As the Swarm Architecture evolved, the federated topology introduced severe friction:
- **Lifecycle Complexity:** Managing multiple independent daemon lifecycles led to brittle startup sequences, port collisions, and orphaned processes during crash-loops.
- **Cross-Subsystem Latency:** Advanced RAG patterns (like hybrid search across episodic memories and static documentation) required complex cross-daemon coordination, defeating the purpose of a unified `Native Edge Graph`.
- **Maintenance Overhead:** Every config template, health check, and orchestration script had to branch on `chromaUnified`, increasing cognitive load and surface area for bugs.

## 2. Decision

We are permanently retiring the federated topology. The system will strictly enforce a **Unified-Only** architecture.

- The `chromaUnified` configuration flag is completely removed from all MCP server configurations.
- `ChromaManager` now exclusively uses the unified `engines.chroma` coordinates.
- `ChromaLifecycleService` has been stripped of all daemon-spawning logic and acts purely as an observability passthrough.
- `HealthService` statically reports a `'unified'` status.

## 3. Implementation Details

### 3.1 Configuration Simplification
The `engines.kb.chroma` namespace in the Memory Core configuration has been collapsed into a single, global `engines.chroma` namespace.

### 3.2 Backup and Restore Semantics
The backup orchestrator (`buildScripts/ai/backup.mjs`) now hardcodes `shared_topology: true` into the `bundle-meta.json` topology descriptor.
The restore orchestrator (`buildScripts/ai/restore.mjs`) explicitly checks for legacy federated backups. Restoring a federated backup (where `bundle.topology.chromaUnified === false`) is rejected by default to prevent vector ID collisions, requiring an explicit `--force-topology-mismatch` flag to proceed.

## 4. Consequences

### Positive
- **Reduced Cognitive Load:** Removal of complex branching logic across managers, services, and tests.
- **Lifecycle Stability:** The Memory Core no longer manages a sub-process daemon, eliminating orphan processes and port contention.
- **Architectural Cohesion:** A single vector store aligns perfectly with the singular `Native Edge Graph` philosophy, enabling seamless cross-domain semantic queries.

### Negative
- **Strict Coupling:** The Memory Core is now strictly dependent on the external (Knowledge Base managed or independently hosted) ChromaDB instance being healthy. A failure in the shared instance takes down semantic capabilities across all subsystems simultaneously.
- **Migration Barrier:** Users with existing federated databases must migrate their vector data to the unified instance. The `--force-topology-mismatch` flag allows forced restoration, but collection IDs and vector mappings require manual verification.
