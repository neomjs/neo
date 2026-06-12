# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The Corporate HQ for AI Agents

Our core vision is to position Neo.mjs not just as a frontend framework, but as the **Operating System and Corporate Headquarters for the AI Workforce**. We are moving beyond simple "tool use" to a future where software is built by a hierarchical swarm of specialized agents (Strategic CEOs, Tactical PMs, Execution Drones), all managed through a powerful, multi-window Neo.mjs interface.

## v13 Architectural Path

The chief-architect document for the v13 release — slim MCP servers, mature SDK, clean daemon architecture, sequenced milestones M1-M7 — lives at [`learn/agentos/v13-path.md`](learn/agentos/v13-path.md). It carries the post-2026-05-08 substrate corrections (Factory pattern partial-rollout reconciliation + `NEO_MC_PRIMARY` retirement sequencing) and audits every open sub-issue of [#9999](https://github.com/neomjs/neo/issues/9999) (the v13 main epic) against the path.

## Current Focus: v12.2 Release

Three concrete epics define the v12.2 release cut, each unlocking a distinct capability tier. All three advance in parallel; the release lands when the critical-path sub-issues across all three reach completion.

### 1. Cloud-Native Knowledge & Multi-Tenant Memory Core ([#9999](https://github.com/neomjs/neo/issues/9999))

Evolve the Memory Core from a single-developer, single-tenant service into a **deployable multi-tenant backend** that dev teams can host centrally so agents across the team share cross-session memory.

*   [x] **DreamService decomposition** ([#10013](https://github.com/neomjs/neo/issues/10013)) — monolithic service split into `SemanticGraphExtractor`, `TopologyInferenceEngine`, `GapInferenceEngine`, `GoldenPathSynthesizer`.
*   [x] **Knowledge Base PR-source ingestion** ([#10057](https://github.com/neomjs/neo/issues/10057)) — pull-request conversations embedded alongside source, guides, and tickets.
*   [x] **Dynamic Topology** (sub-epic [#10015](https://github.com/neomjs/neo/issues/10015)) — permanently unified ChromaDB architecture (legacy federated toggle retired in #11014). Client-side routing ([#10001](https://github.com/neomjs/neo/issues/10001)) + lifecycle bypass ([#10007](https://github.com/neomjs/neo/issues/10007)) merged; Playwright coverage in [#10008](https://github.com/neomjs/neo/issues/10008) / [#10009](https://github.com/neomjs/neo/issues/10009) deferred as optional follow-up polish.
*   [ ] **Multi-Tenant Identity & Data Privacy** (sub-epic [#10016](https://github.com/neomjs/neo/issues/10016)) — `userId` extracted from OAuth/OIDC claims, written into ChromaDB metadata, filtered on read; team-vs-private mode toggles read-side isolation. [#10000](https://github.com/neomjs/neo/issues/10000) merged (JWT-claim identity propagation via a new `RequestContextService` singleton wrapping `AsyncLocalStorage`; per-tenant write tags + read filters + tenant-safe `deleteAllSummaries`); [#10010](https://github.com/neomjs/neo/issues/10010) team-vs-private read flag, [#10011](https://github.com/neomjs/neo/issues/10011) Native Edge Graph row-level security, and [#10017](https://github.com/neomjs/neo/issues/10017) migration + backward-compat queued.
*   **Value:** A centrally deployed Memory Core behind a single OAuth gateway (Keycloak, GitLab, Google) enables an entire engineering team's agents to learn from each other's sessions while preserving per-user audit trails and GDPR-compliant tenant isolation.

### 2. Concept Ontology & Semantic Gap Inference ([#10030](https://github.com/neomjs/neo/issues/10030))

A lightweight, version-controlled knowledge graph mapping Neo.mjs architectural concepts to their implementing source files, explaining guides, and examples. Replaces the regex-based `GapInferenceEngine` with deterministic graph traversal — gap detection becomes *"which concepts lack an `EXPLAINED_BY` edge?"* rather than brittle file-path matching.

*   [x] **Foundational schema + ingestion** ([#10031](https://github.com/neomjs/neo/issues/10031), [#10032](https://github.com/neomjs/neo/issues/10032), [#10033](https://github.com/neomjs/neo/issues/10033), [#10035](https://github.com/neomjs/neo/issues/10035), [#10049](https://github.com/neomjs/neo/issues/10049)) — JSONL concept graph wired into DreamService; `GapInferenceEngine` refactored to traverse it.
*   [x] **Memory Core concept discovery** ([#10036](https://github.com/neomjs/neo/issues/10036)) — LLM-driven concept extraction from session summaries and pull-request conversations.
*   [x] **Infrastructure polish** ([#10085](https://github.com/neomjs/neo/issues/10085), [#10086](https://github.com/neomjs/neo/issues/10086), [#10087](https://github.com/neomjs/neo/issues/10087)) — cycle-scope hoisting, config-lifted weight threshold, dedicated `ORPHAN_CONCEPT` display channel.
*   [ ] **ChromaDB concept embedding + hybrid search** ([#10037](https://github.com/neomjs/neo/issues/10037)) — unlocks relevance-bounded query APIs ([#10080](https://github.com/neomjs/neo/issues/10080)) and `ask_knowledge_base` telemetry ([#10081](https://github.com/neomjs/neo/issues/10081)).
*   [ ] **Concept graph visualization app** ([#10034](https://github.com/neomjs/neo/issues/10034)) — Neo.mjs frontend rendering the ontology interactively; serialized concept tree doubles as LLM context primer.
*   [ ] **Concept description enrichment** ([#10050](https://github.com/neomjs/neo/issues/10050)) — collaborative session required; agent-generated descriptions produce wrong results without architectural decision history.
*   **Value:** Cuts Dream-cycle cost (no per-match LLM verification), eliminates false-positive "missing guide" noise, and produces a curated architectural vocabulary both humans and agents can navigate.

### 3. Grid Multi-Body Architecture — Zero-Jitter Locked Columns ([#9486](https://github.com/neomjs/neo/issues/9486))

Completion of the multi-body Grid refactor that partitions the DOM into `bodyStart`, `body`, and `bodyEnd` components for high-performance locked-column layouts on large datasets. 22 / 35 sub-issues closed as of v12.1.

*   [x] **Selection model synchronization across bodies** ([#9839](https://github.com/neomjs/neo/issues/9839), [#9840](https://github.com/neomjs/neo/issues/9840), [#9841](https://github.com/neomjs/neo/issues/9841)) — peer-state adoption for row, column, and cell models.
*   [x] **Whitebox E2E fixture infrastructure** ([#9834](https://github.com/neomjs/neo/issues/9834), [#9835](https://github.com/neomjs/neo/issues/9835)) — Neural Link Playwright fixtures expose the introspection needed for multi-body correctness assertions.
*   [ ] **Centralized Selection Model orchestration** ([#9865](https://github.com/neomjs/neo/issues/9865)) — restore the abstraction that a Multi-Body Grid behaves as a single logical entity; eliminates controller-level boilerplate.
*   [ ] **3-Tier Component Orchestration refactoring** ([#9872](https://github.com/neomjs/neo/issues/9872)) — push instantiation downwards to unblock centralized models.
*   [ ] Remaining sub-issues under [#9486](https://github.com/neomjs/neo/issues/9486) prioritized in-cycle.
*   **Value:** Large grid datasets (DevIndex's 50k-row grid, enterprise-grade data displays) gain smooth locked-column behavior without per-body boilerplate in application controllers.

### Enabler landing alongside v12.2

**Embedding transition.** The shipped release zip currently embeds the Knowledge Base with `gemini-embedding-001` (3072-dimensional vectors). Local runs can already opt into `qwen3-8b` (4096-dimensional) via `NEO_GLOBAL_EMBEDDING`. Shifting the release-zip default to qwen3-8b aligns with the local-inference-first direction already established in the Memory Core and removes the Gemini-API dependency for fresh setups. Tracks naturally with the multi-tenant cloud deployment story — self-hosted deployments can run entirely offline on a single machine with sufficient GPU/MLX capacity.

## Agent OS Foundation

Neo.mjs ships as **two hemispheres on one class system**. Every Agent OS component — `DreamService`, `GraphService`, `Agent`, `Loop`, the MCP services — extends `Neo.core.Base` and uses `Neo.setupClass()` exactly like `Neo.button.Base` or `Neo.grid.Container`. The AI infrastructure is not a separate project; it is a native inhabitant of the framework it maintains.

> For the full architectural map, see [Architecture Overview](learn/benefits/ArchitectureOverview.md) and [The Dream Pipeline & Golden Path](learn/agentos/DreamPipeline.md).

### v12.1 Baseline (long-standing, pre-2026-03-27)

Stable platform surface entering the current release cycle:

*   **Frontend Runtime Engine.** Multi-threaded Web Worker architecture (App, VDom, Data, Canvas) keeping the Main Thread free for DOM mutations only. SharedWorker mode enables multi-window applications sharing a single App Worker heap — components move between windows without losing state.
*   **Neural Link Bridge.** Bidirectional WebSocket bridge between the Agent OS and the browser runtime. Agents query the semantic component tree directly (no DOM scraping), inspect stores and state providers, and hot-patch class prototypes at runtime. The same bridge serves Playwright whitebox E2E fixtures — unified tooling across AI-driven and CI-driven introspection.
*   **Core MCP Servers.** Knowledge Base (semantic RAG), Memory Core (episodic memory), GitHub Workflow (offline-first issue management), Neural Link (runtime introspection), File System.
*   **Neo Class System.** `Neo.core.Base` + `Neo.setupClass()` unifying Frontend and Agent OS under a single inheritance hierarchy.
*   **Cognitive Loop.** `ai/agent/Loop.mjs` drives every autonomous agent through *Perceive → Reason → Act → Reflect*, persisting every thought as an episodic memory via `add_memory()`.
*   **SDK Bouncer.** `ai/services.mjs` wraps each MCP method with Zod runtime validation. Frontier models (Opus, Gemini) access MCP directly; sub-agents (Gemma 4-31B) access the same services via schema-validated calls — preventing hallucinated JSON from reaching internal databases.
*   **Headless Agent SDK.** `ai/Agent.mjs` base class extending `Neo.core.Base` with Loop, Scheduler, and model-provider abstraction (Gemini, Ollama, OpenAI-compatible). `ai/agents/pm.mjs` and `ai/agents/dev.mjs` ship as reference implementations; the "Fake Agent" Direct-Service-Import pattern remains available for single-shot scripts.

### Shipped since v12.1 — 332 tickets resolved in under one month, 33 at epic level

v12.1 released on 2026-03-27. Sustained 10–20 ticket/day velocity delivered the self-improving substrate that v12.2 builds on. Concentration points: Grid Multi-Body (#9486, 18 sub-issues closed this cycle), the Hybrid GraphRAG / Dream Pipeline ecosystem (#9673, #9638, #9687 — 30+ combined), and Concept Ontology (#10030, 9 sub-issues closed). Measured via `node buildScripts/release/analyzeClosedSinceRelease.mjs`:

*   **DreamService & the Golden Path.** Six-phase REM pipeline (File Ingest → Tri-Vector Extraction → Topological Conflict Detection → Capability Gap Inference → Hebbian Decay → Golden Path Synthesis) digests session memories into the Native Edge Graph and synthesizes `resources/content/sandman_handoff.md` — a mathematically ranked roadmap (`semantic distance × structural weight + modifiers`) that directs the Orchestrator. *The system evolves by predicting its own evolution.*
*   **Native Edge Graph.** SQLite-backed knowledge graph. 14 node types (`SESSION`, `MEMORY`, `ISSUE`, `CLASS`, `METHOD`, `FILE`, `GUIDE`, `TEST`, …) and 8 relationships (`IMPLEMENTS`, `EXTENDS`, `DEPENDS_ON`, `BLOCKS`, `RELATES_TO`, `RESOLVES`, `CAUSES_ISSUE`). Populated via strict JSON-schema LLM extraction with autonomous repair loops and `Type:Name` ID enforcement. Capability gap signals (`[TEST_GAP]`, `[GUIDE_GAP]`, `[ORPHAN_CONCEPT]`) attach to nodes with 7-day TTL pruning so stale gaps naturally fade.
*   **Context Priming Engine.** `get_context_frontier` surfaces the Native Edge Graph's strategic frontier — the weighted nodes closest to the active focus — at agent boot, curing "zero-state amnesia" across session restarts and informing the Perceive phase of every cognitive cycle. Supported by the Autonomous Priority Graph Engine (#9706), Graph Drift & Gravity Detection (#9784), and the `mutate_frontier` MCP tool for operator-driven strategic pivots.
*   **Concept Ontology foundation.** Deterministic graph-traversal gap inference replacing regex + per-match LLM verification. Core pillars shipped; remaining scope tracked under v12.2 goal #2.
*   **Local LLM inference infrastructure.** `OpenAiCompatible`, `Ollama`, and `Gemma-4` provider adapters (#9639) plus the Librarian sub-agent orchestration (#9643) enable fully offline Memory Core operation — DreamService REM extraction, embedding generation, and `[GUIDE_GAP]` verification all run on local hardware (MLX, Ollama). Unlocks cost-bounded swarm operation and air-gapped enterprise deployments.
*   **Fat Ticket A2A Protocol.** GitHub Issues as durable inter-hardware memory bridge (#9790). Because the swarm runs across disjoint SQLite instances (one Memory Core per hardware node, no cross-network merge), Fat Tickets preserve architectural context, rationale, and avoided pitfalls so sessions can hand off work cleanly across machines and agent harnesses (Claude Code, Antigravity, Gemini CLI).
*   **Progressive Disclosure Skills.** The formalized agent skills under `.agents/skills/` (#9672 Anthropic Skills Standard) govern the swarm's execution discipline — `ticket-intake`, `ticket-create`, `pull-request`, `pr-review`, `tech-debt-radar` as lifecycle gates; `neural-link`, `unit-test`, `whitebox-e2e`, `memory-mining`, `self-repair` as tactical workflows. Each skill is loaded on-demand via the Skill tool so agent context stays lean until a workflow fires.

### Phase 3: The Command Center (post-v12.2)

**Goal:** The "Killer App" — A multi-window Neo.mjs application to visualize and control the swarm.

We will build the **Neo Command Center** (`apps/agent-os`), a desktop-class UI that serves as the "God View" for your digital organization.

*   **Visual Orchestration:** A real-time graph showing active agents, their current tasks, and their status.
*   **Live Thought Streams:** Click any agent node to open a window streaming its live `THOUGHT` logs.
*   **Human-in-the-Loop:** A "Plan Verification" mode where Strategic Agents propose a plan in the UI, and the human Chairman approves it before execution proceeds.
*   **Competitive Edge:** This leverages Neo.mjs's unique multi-window and shared-worker capabilities to provide an interface that single-tab competitors cannot match.

### Phase 4: The Self-Evolving App Platform (Runtime Orchestration) - **[ACTIVE RESEARCH]**

**Goal:** Enable "Self-Healing" and "Self-Evolving" applications where AI Agents act as runtime operators.

We will evolve the **Neural Link** into a bidirectional bridge that allows Agents to not just write code, but **drive** the application at runtime:

*   **Runtime Blueprints:** Agents can inject entire component trees (via JSON Blueprints) into running applications without a reload.
*   **Automated Diagnostics (Dev):** Agents capture multi-thread error context to auto-generate bug reports or PRs.
*   **State Recovery (User):** Agents detect crashes or silent failures (e.g., "dead clicks") and intervene to reset component state or guide the user.
*   **Live Customization:** Non-technical users can verbally instruct Agents to modify the UI layout or behavior on the fly (e.g., "Move the chart to the right").
*   **Persistence Layer:** Agent-driven changes are stored (e.g., in `localStorage` or a remote user profile), allowing runtime customizations to survive page reloads and become permanent user preferences.
*   **Technical Spec:** See [.github/AGENT_ARCHITECTURE.md](.github/AGENT_ARCHITECTURE.md) for the detailed technical specification.

### Phase 5: Decoupling the Ecosystem (Future)

**Goal:** Evolve our general-purpose AI tools into standalone, reusable packages.

*   **Publish MCP Servers to npm:** The **Memory Core** and **GitHub Sync** MCP servers will be published as independent packages.
*   **Visual Service:** Evolve the "Sighted Agent" concept into a service that allows agents to programmatically capture screenshots and inspect the A11y tree.
*   **Hybrid Distribution:** Split AI capabilities into "Core" (logic) and "Server" (MCP wrappers) packages to support both embedded SDK use and external CLI use.
