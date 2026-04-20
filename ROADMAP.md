# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: The Corporate HQ for AI Agents

Our core vision is to position Neo.mjs not just as a frontend framework, but as the **Operating System and Corporate Headquarters for the AI Workforce**. We are moving beyond simple "tool use" to a future where software is built by a hierarchical swarm of specialized agents (Strategic CEOs, Tactical PMs, Execution Drones), all managed through a powerful, multi-window Neo.mjs interface.

## Current Focus: v12.2 Release

Three concrete epics define the v12.2 release cut, each unlocking a distinct capability tier. All three advance in parallel; the release lands when the critical-path sub-issues across all three reach completion.

### 1. Cloud-Native Knowledge & Multi-Tenant Memory Core ([#9999](https://github.com/neomjs/neo/issues/9999))

Evolve the Memory Core from a single-developer, single-tenant service into a **deployable multi-tenant backend** that dev teams can host centrally so agents across the team share cross-session memory.

*   [x] **DreamService decomposition** ([#10013](https://github.com/neomjs/neo/issues/10013)) — monolithic service split into `SemanticGraphExtractor`, `TopologyInferenceEngine`, `GapInferenceEngine`, `GoldenPathSynthesizer`.
*   [x] **Knowledge Base PR-source ingestion** ([#10057](https://github.com/neomjs/neo/issues/10057)) — pull-request conversations embedded alongside source, guides, and tickets.
*   [ ] **Dynamic Topology** (sub-epic [#10015](https://github.com/neomjs/neo/issues/10015)) — unified vs federated ChromaDB routing via `NEO_CHROMA_UNIFIED`. [#10001](https://github.com/neomjs/neo/issues/10001) landed; [#10007](https://github.com/neomjs/neo/issues/10007), [#10008](https://github.com/neomjs/neo/issues/10008), [#10009](https://github.com/neomjs/neo/issues/10009) queued.
*   [ ] **Multi-Tenant Identity & Data Privacy** (sub-epic [#10016](https://github.com/neomjs/neo/issues/10016)) — `userId` extracted from OAuth/OIDC claims, written into ChromaDB metadata, filtered on read; team-vs-private mode toggles read-side isolation. [#10000](https://github.com/neomjs/neo/issues/10000), [#10010](https://github.com/neomjs/neo/issues/10010), [#10011](https://github.com/neomjs/neo/issues/10011), [#10017](https://github.com/neomjs/neo/issues/10017) queued.
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

## Foundation Completed: v11.x → v12.1

The "Single Agent, Rich Context" baseline is in place and powers the swarm infrastructure that v12.2 builds on top of:
-   **Context Engineering:** The Knowledge Base (RAG) provides deep understanding of the codebase.
-   **Memory Core:** Agents have persistent, cross-session memory.
-   **AI SDK:** The `ai/services.mjs` library allows direct code execution in Node.js.

Phases 1 and 2 below trace the organizational-coordination path from single agent to coordinated swarm.

### Phase 1: The Connected Organization (v11.x Late)

**Goal:** Enable "Fire and Forget" task delegation across repositories using existing infrastructure.

Instead of building complex real-time message buses immediately, we will leverage **GitHub Issues** as a robust, asynchronous "Job Board" for the swarm.

*   [x] **Ticket-Driven Protocol:** Define a strict schema for `agent-task` labels and issue templates. This turns GitHub into the communication bus between agents.
*   [ ] **Cross-Repo Management:** Enhance the `github-workflow` MCP server to support creating and scanning issues across the entire organization (e.g., Middleware Agent assigning a task to the Framework Agent).
*   [x] **Value:** Immediate ability for an agent in one repo to "queue" work for an agent in another, without requiring simultaneous execution.

### Phase 2: The Headless Workforce (v12.0)

**Goal:** Move beyond the "Black Box" CLI by creating a native **Headless Agent SDK**.

We will empower developers (and the "CEO Agent") to spawn specialized agents programmatically as lightweight Node.js processes.

*   [x] **Role-Based Scripts (MVP):** Created specialized, standalone scripts using the "Fake Agent" pattern (Direct Service Import):
    *   `ai/agents/pm.mjs`: Scans Epics, breaks them down into User Stories (Issues).
    *   `ai/agents/dev.mjs`: Scans open Issues, writes code, runs tests, and submits PRs.
*   [x] **The "Feature Factory" Experiment:** A proof-of-concept where a single command triggers a chain of agents.
*   [ ] **Neo.ai.Agent Class:** (Deferred) Standardize the scripts into a formal SDK class structure.

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

