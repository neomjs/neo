# Neo.mjs Architecture Overview

This guide provides a top-level architectural map of the Neo.mjs Agent OS. It traces the vertical
path of intelligence — from a user clicking a button, through the worker threads, up into the
Agent OS, through the dream pipeline, and back down as an improved codebase.

For setup and configuration of individual MCP servers, see the dedicated guides linked at the bottom
of this document.

## The Two Hemispheres

Neo.mjs is a single platform with two distinct hemispheres that share a common nervous system —
the Neo Class System:

```mermaid
graph LR
    classDef runtime fill:#1a1a2e,stroke:#e94560,stroke-width:2px,color:#eee
    classDef agentOS fill:#0f3460,stroke:#16c79a,stroke-width:2px,color:#eee
    classDef core fill:#222,stroke:#f5a623,stroke-width:3px,color:#fff

    subgraph Platform["Neo.mjs Platform"]
        direction TB
        Core["Neo Class System"]:::core
        Runtime["Frontend Runtime Engine"]:::runtime
        AgentOS["Agent OS"]:::agentOS

        Core --- Runtime
        Core --- AgentOS
    end
```

Both hemispheres are built on the same `Neo.core.Base` class system. `DreamService`,
`GraphService`, `Agent`, `Loop`, and every MCP service extend `Neo.core.Base` and use
`Neo.setupClass()` exactly like `Neo.button.Base` or `Neo.grid.Container`. The AI
infrastructure is not a separate project — it is a native inhabitant of the framework
it maintains.

## Left Hemisphere: The Runtime Engine

The runtime is Neo's core value proposition. All application logic runs **off the Main Thread**
inside a multi-worker architecture:

```mermaid
flowchart TD
    classDef main fill:#e8d5b7,stroke:#8b6914,stroke-width:2px,color:#333
    classDef worker fill:#1a1a2e,stroke:#e94560,stroke-width:1px,color:#eee
    classDef vdom fill:#2d1b4e,stroke:#9b59b6,stroke-width:1px,color:#eee
    classDef data fill:#1b2e4e,stroke:#3498db,stroke-width:1px,color:#eee

    subgraph Browser["Browser Environment"]
        direction TB

        subgraph MainThreads["Main Threads"]
            direction LR
            WinA["Window A"]:::main
            WinB["Window B"]:::main
        end

        subgraph Workers["Worker Sandbox"]
            direction TB
            App["App Worker"]:::worker
            VDom["VDom Worker"]:::vdom
            Data["Data Worker"]:::data
            Canvas["Canvas Worker"]:::data
        end

        App --"VDOM Blueprint"--> VDom
        VDom --"Deltas"--> WinA
        VDom --"Deltas"--> WinB
        WinA --"DOM Events"--> App
        WinB --"DOM Events"--> App
        App <--"MessageChannel"--> Data
        App <--"MessageChannel"--> Canvas
    end
```

### Key Concepts

- **App Worker:** Hosts all components, controllers, state providers, and business logic.
  This is where your application code lives.
- **VDom Worker:** A dedicated thread for the JSON diff engine. It receives VDOM blueprints
  from the App Worker and computes minimal delta updates.
- **Data Worker:** Handles stores, models, sorting, filtering, and grouping — keeping
  heavy data operations off the main thread.
- **Main Threads:** Thin clients that only apply DOM mutations. Each browser window has
  its own main thread, but they all connect to the same App Worker.

### The Triangular Optimization

VDOM updates follow an optimized triangular path:

1. **App Worker sends** the new JSON VDOM tree to the VDom Worker
2. **The Main Thread intercepts** the VDom Worker's reply and applies delta mutations to the
   DOM immediately
3. **Main Thread forwards** confirmation back to the App Worker

This eliminates a full round-trip vs naively routing updates through the App Worker.

### SharedWorker Mode

When `useSharedWorkers: true`, the App Worker becomes a `SharedWorker`. Multiple browser
windows connect to the **same** App Worker instance, sharing a single JavaScript heap.
Components can be moved between windows — unmounted from one, remounted in another —
without losing state. This is the foundation of Neo's multi-window application support.

## Right Hemisphere: The Agent OS

The Agent OS is a Node.js infrastructure that provides AI agents with persistent memory,
semantic understanding of the codebase, and the ability to introspect the live running
application:

```mermaid
flowchart TD
    classDef frontier fill:#0f3460,stroke:#16c79a,stroke-width:2px,color:#fff
    classDef mcp fill:#1a3c34,stroke:#2ecc71,stroke-width:1px,color:#eee
    classDef db fill:#2c2c2c,stroke:#bbb,stroke-width:1px,color:#ddd
    classDef sdk fill:#4a1942,stroke:#e74c3c,stroke-width:2px,color:#eee
    classDef agent fill:#1a2744,stroke:#8e44ad,stroke-width:1px,color:#eee

    subgraph AgentRuntime["Agent Runtime"]
        direction TB
        Orchestrator["Orchestrator"]:::frontier
        Agent["Neo.ai.Agent"]:::frontier

        Orchestrator -->|"schedule"| Agent

        subgraph CognitiveLoop["Cognitive Loop"]
            direction LR
            Perceive["Perceive"]:::agent
            Reason["Reason"]:::agent
            Act["Act"]:::agent
            Reflect["Reflect"]:::agent

            Perceive --> Reason --> Act --> Reflect
            Reflect -.->|"loop"| Perceive
        end

        Agent --> CognitiveLoop
    end

    subgraph SDKLayer["Agent SDK"]
        direction TB
        Zod["Zod Validation Boundary"]:::sdk
    end

    CognitiveLoop <--> SDKLayer

    subgraph MCPServers["MCP Servers"]
        direction TB
        KB["Knowledge Base"]:::mcp
        Mem["Memory Core"]:::mcp
        GH["GitHub Workflow"]:::mcp
        NL["Neural Link"]:::mcp
        FS["File System"]:::mcp
    end

    SDKLayer <--> MCPServers

    subgraph Storage["Persistence Layer"]
        direction LR
        ChromaKB[("ChromaDB KB")]:::db
        ChromaMem[("ChromaDB Memory")]:::db
        SQLite[("SQLite Graph")]:::db
    end

    KB <--> ChromaKB
    Mem <--> ChromaMem
    Mem <--> SQLite
```

### The Cognitive Loop

The agent runtime (`ai/agent/Loop.mjs`) implements a four-phase cognitive loop:

1. **Perceive:** The `ContextAssembler` fetches long-term memory (session summaries via RAG),
   short-term memory (recent session history), and skill metadata to build the LLM context window.
2. **Reason:** The assembled context is sent to the LLM (e.g., Claude Opus, Gemini) for inference,
   producing a response that may include tool calls.
3. **Act:** Tool calls are executed via the MCP protocol (for frontier models) or the SDK
   (for sub-agents with Zod validation).
4. **Reflect:** Every thought, decision, and tool call is persisted via `add_memory()`, creating
   the episodic memory record that the DreamService will later digest.

### The SDK Bouncer Pattern

`ai/services.mjs` is the critical safety layer. It loads OpenAPI specs from each MCP server and
wraps each method with `makeSafe()` — a function that generates Zod validators at startup.

- **Frontier models** (Opus, Gemini) access services via MCP protocol (stdio) with unbounded
  tool access.
- **Sub-agents** (e.g., Gemma 4-31B for doc patching) access the same services via the SDK,
  but every call is runtime-validated against the OpenAPI schema, preventing hallucinated JSON
  from reaching internal databases.

### The Five MCP Servers

| Server | Purpose | Key Operations |
|---|---|---|
| **Knowledge Base** | Semantic RAG over the indexed codebase | `ask_knowledge_base`, `query_documents` |
| **Memory Core** | Episodic memory, session summaries, native edge graph | `add_memory`, `query_raw_memories`, `get_context_frontier` |
| **GitHub Workflow** | Offline-first issue and PR management | `create_issue`, `sync_all`, `manage_issue_labels` |
| **Neural Link** | Live application introspection via WebSocket | `get_component_tree`, `patch_code`, `simulate_event` |
| **File System** | Direct codebase read/write access | Standard file operations |

## The Neural Link Bridge

The Neural Link is the connection point between the two hemispheres. It allows the Agent OS
to reach *into* the running browser application:

```mermaid
flowchart LR
    classDef agent fill:#0f3460,stroke:#16c79a,stroke-width:1px,color:#eee
    classDef bridge fill:#4a1942,stroke:#e74c3c,stroke-width:2px,color:#eee
    classDef runtime fill:#1a1a2e,stroke:#e94560,stroke-width:1px,color:#eee
    classDef test fill:#1b3a4b,stroke:#3498db,stroke-width:1px,color:#eee

    AI["AI Agent"]:::agent
    MCP["Neural Link MCP Server"]:::agent
    Bridge["WebSocket Bridge"]:::bridge
    Client["Neo.ai.Client"]:::runtime
    Services["Client Services"]:::runtime

    AI -->|"MCP stdio"| MCP
    MCP <-->|"WebSocket"| Bridge
    Bridge <-->|"WebSocket"| Client
    Client --> Services

    PW["Playwright"]:::test
    PW -->|"nlApp fixture"| Bridge
```

The AI does not scrape DOM. It queries the **semantic component tree** directly — asking for
components by `ntype`, reading store data, inspecting state providers, and even hot-patching
methods on class prototypes at runtime. The same WebSocket bridge serves both AI agents and
Playwright test fixtures, creating a unified "Whitebox E2E" testing architecture.

### How it Works

1. The `Neo.ai.Client` singleton lives inside the **App Worker** (browser-side)
2. It connects to the Neural Link MCP Server via WebSocket (JSON-RPC 2.0)
3. The MCP Server exposes 5 client-side service categories: Component, Data, Instance,
   Interaction, and Runtime
4. When a new browser window connects, the client rehydrates the full window topology
   to the Agent OS

## The Dream Pipeline

The `DreamService` is an autonomous background daemon that runs when agents are idle.
It is the mechanism by which the system **learns from itself**:

```mermaid
flowchart TD
    classDef dream fill:#3d1f00,stroke:#f39c12,stroke-width:2px,color:#eee
    classDef graphDb fill:#2c2c2c,stroke:#2ecc71,stroke-width:1px,color:#eee
    classDef output fill:#1a3c34,stroke:#16c79a,stroke-width:1px,color:#eee
    classDef phase fill:#1a1a2e,stroke:#e94560,stroke-width:1px,color:#eee

    Trigger["Sandman Wakes"]:::dream

    subgraph Pipeline["REM Pipeline"]
        direction TB

        P0["Phase 0: File Ingest"]:::phase
        P1["Phase 1: Tri-Vector Extraction"]:::phase
        P2["Phase 2: Topological Conflict Detection"]:::phase
        P3["Phase 3: Capability Gap Inference"]:::phase
        P4["Phase 4: Hebbian Decay"]:::phase
        P5["Phase 5: Golden Path Synthesis"]:::phase

        P0 --> P1 --> P2 --> P3 --> P4 --> P5
    end

    Trigger --> Pipeline

    subgraph Outputs["Outputs"]
        direction LR
        GraphOut["Native Edge Graph"]:::graphDb
        Handoff["sandman_handoff.md"]:::output
        Gaps["Capability Gaps"]:::output
    end

    Pipeline --> GraphOut
    Pipeline --> Handoff
    Pipeline --> Gaps
```

### The Six Phases

1. **File Ingest:** `FileSystemIngestor.syncWorkspaceToGraph()` scans the repository and ingests
   issues, markdown files, and source files into the Native Edge Graph (SQLite).

2. **Tri-Vector Extraction:** A local LLM (MLX / OpenAI-compatible) analyzes undigested session
   memories and extracts three vectors: semantic graph nodes and edges, the feature namespace
   being worked on, and any roadmap impact.

3. **Topological Conflict Detection:** Another LLM pass scans for tickets that have been
   rendered obsolete, superseded, or duplicated by recent session decisions. Alerts are written
   to `sandman_handoff.md`.

4. **Capability Gap Inference:** This phase is **deterministic** — it does not use an LLM.
   It cross-references structural code nodes and concept-ontology nodes against explicit graph evidence:
   - Does `test/` contain files with precise evidence for this class's semantic name tokens? If not: **TEST_GAP**; if yes, add a `VALIDATES` edge from the test `FILE` node to the structural source node.
   - Does a high-weight `CONCEPT` node have an outbound `EXPLAINED_BY` edge to a guide/doc file? If not: **GUIDE_GAP**. Concepts with guide coverage but no `EXEMPLIFIED_BY` edge become **EXAMPLE_GAP**.

5. **Hebbian Decay:** Universal edge weight fade and garbage collection of stale nodes,
   inspired by synaptic pruning in neuroscience.

6. **Golden Path Synthesis:** Tri-Vector scoring of all OPEN issues, producing a prioritized
   roadmap written to `sandman_handoff.md`. This file is the strategic dashboard that the
   next agent instance reads on boot.

## The Closed Loop

This is the architecture's gravitational center. Every piece connects into a single
self-improving feedback loop:

```mermaid
flowchart TD
    classDef human fill:#1a3c34,stroke:#16c79a,stroke-width:2px,color:#eee
    classDef agent fill:#0f3460,stroke:#3498db,stroke-width:1px,color:#eee
    classDef memory fill:#4a1942,stroke:#e74c3c,stroke-width:1px,color:#eee
    classDef dream fill:#3d1f00,stroke:#f39c12,stroke-width:2px,color:#eee
    classDef kb fill:#1a1a2e,stroke:#e94560,stroke-width:1px,color:#eee
    classDef code fill:#222,stroke:#f5a623,stroke-width:2px,color:#fff

    Human["Human Operator"]:::human
    Agent["Peer maintainer (self-selects)"]:::agent
    Memory["Memory Core records"]:::memory
    Dream["Sandman digests"]:::dream
    GraphNode["Graph re-prioritizes"]:::dream
    KB["Knowledge Base updated"]:::kb
    Code["Codebase improved"]:::code

    GraphNode -->|"sandman_handoff.md (advisory forecast)"| Agent
    Human -.->|"Gives direction (optional)"| Agent
    Agent -->|"add_memory"| Memory
    Memory -->|"Undigested sessions"| Dream
    Dream --> GraphNode
    Agent -->|"Opens PR"| Code
    Human -->|"Reviews + merges PR"| Code
    Code -->|"KB sync"| KB
    KB -->|"ask_knowledge_base"| Agent
```

The Golden Path (`sandman_handoff.md`) is an **advisory forecast**, not a work queue: peer
maintainers self-select what to work on, while the human operator steers direction and holds
the merge gate rather than assigning tickets.

The agent's improvements to the framework also improve the agent's knowledge base,
which improves the agent's future decisions. This is what distinguishes Neo.mjs from tools
that provide memory, orchestration, or multi-agent roles in isolation — Neo builds the
complete organism where the codebase and the agent co-evolve.

## Structural Inventory

### Runtime Engine (Browser)

| Package | Purpose | Key Classes | Decisions |
|---|---|---|---|
| `src/core/` | Class system, Observable, Logger | `Base`, `Observable` | — |
| `src/component/` | UI primitives | `Base`, `Wrapper` | — |
| `src/container/` | Layout containers | `Base`, `Viewport` | — |
| `src/grid/` | Buffered data grids | `Container`, `View` | — |
| `src/data/` | Data layer | `Store`, `Model`, `RecordFactory` | — |
| `src/state/` | State management | `Provider` | — |
| `src/worker/` | Thread management | `App`, `VDom`, `Data`, `Manager` | — |
| `src/vdom/` | Virtual DOM engine | `Helper` | — |
| `src/main/` | Main thread addons | `DomEvents`, `DomAccess` | — |
| `src/ai/` | Neural Link client | `Client` | — |

### Agent OS (Node.js)

Post-M6 ([#10986](https://github.com/neomjs/neo/issues/10986)) the per-MCP-server services were lifted from `ai/mcp/server/<name>/services/` into the flat SDK boundary at `ai/services/<name>/`. The `ai/mcp/server/<name>/` directories now host only the server entry-point (`Server.mjs`), config templates, logger, and shared helpers; the service implementations live under `ai/services/<name>/`. Both rows are listed below for navigability.

| Package | Purpose | Key Classes | Decisions |
|---|---|---|---|
| `ai/Agent.mjs` | Agent base class | `Agent` | — |
| `ai/agent/` | Cognitive runtime | `Loop`, `Orchestrator`, `Scheduler` | — |
| `ai/config.template.mjs`, `ai/ConfigProvider.mjs` | Tier-1 Agent OS config template and shared config provider consumed by top-level and MCP server configs | `Config`, `ConfigProvider` | — |
| `ai/context/` | Context window management | `Assembler` | — |
| `ai/provider/` | LLM abstraction | `Gemini`, `Ollama`, `OpenAiCompatible` | — |
| `ai/services.mjs` | SDK with Zod validation aggregator | — | — |
| `ai/services/knowledge-base/` | Semantic RAG services (post-M6 SDK location) | `QueryService`, `SearchService`, `KBRecorderService` | — |
| `ai/services/memory-core/` | Episodic memory services (post-M6 SDK location) | `MemoryService`, `SessionService`, `GraphService`, `MailboxService` | [ADR 0001](../agentos/decisions/0001-cross-process-cache-coherence.md), [ADR 0002](../agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md) |
| `ai/services/github-workflow/` | Issue/PR management services (post-M6 SDK location) | `IssueService`, `SyncService`, `LabelService` | — |
| `ai/services/neural-link/` | Live app bridge services (post-M6 SDK location) | `ConnectionService`, `RecorderService` | — |
| `ai/services/shared/vector/` | Cross-server vector-engine primitives consumed by per-server ChromaManager classes (KB + MC); functional helpers, not Neo classes | `chromaClientPrimitives.mjs` (`chromaConnect`, `createSilentExecutor`, `chromaDeleteCollection`) | — |
| `ai/scripts/` | One-shot operator scripts + thin helper wrappers | `lifecycle/`, `maintenance/` | — |
| `ai/daemons/` | Long-running daemon classes and entry points | `Orchestrator`, `orchestrator/daemon.mjs`, `wake/daemon.mjs`, `DreamService`, `SwarmHeartbeatService` | [ADR 0002](../agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md) |
| `ai/graph/` | Native Edge Graph (SQLite-backed knowledge graph) | `Database`, `Store`, `NodeModel` | [ADR 0001](../agentos/decisions/0001-cross-process-cache-coherence.md), [ADR 0015](../agentos/decisions/0015-graph-store-backend-posture.md) |
| `ai/mcp/server/knowledge-base/` | KB MCP-server entry point + config | `Server`, `config` | — |
| `ai/mcp/server/memory-core/` | MC MCP-server entry point + config | `Server`, `config` | [ADR 0001](../agentos/decisions/0001-cross-process-cache-coherence.md) |
| `ai/mcp/server/github-workflow/` | GH-WF MCP-server entry point + config | `Server`, `config` | — |
| `ai/mcp/server/neural-link/` | NL MCP-server entry point + config | `Server`, `config` | — |
| `ai/mcp/server/shared/` | Cross-cutting MCP infrastructure | `BaseServer`, `AuthMiddleware`, `RequestContextService`, `TransportService` | — |

## Architectural Decision Records

The Agent OS subsystem records its load-bearing architectural trade-offs in [`learn/agentos/decisions/`](../agentos/decisions/). Every cross-system trade-off — i.e. one that touches multiple subsystems, sets a precedent for future code, or affects load-bearing invariants — earns an ADR (per the `structural-pre-flight` skill's Strategy-vs-Tactics threshold). Per-class localized constraints stay inline as Anchor & Echo guards instead.

The map-as-pointer principle: the Structural Inventory above links each subsystem row to its relevant ADRs so readers who follow the map naturally encounter the architectural-decision substrate without needing to remember to consult `decisions/` separately. Authors of new ADRs MUST add the link to the affected Structural Inventory rows in the same PR (per [#10449](https://github.com/neomjs/neo/issues/10449) Sub-Issue 2 / `structural-pre-flight` map-maintenance discipline).

| ADR | Subject | Subsystems Affected | Status |
|---|---|---|---|
| [0001](../agentos/decisions/0001-cross-process-cache-coherence.md) | Cross-Process Cache Coherence for Memory Core Graph | `ai/services/memory-core/`, `ai/graph/`, `ai/mcp/server/memory-core/` | Proposed (#10186 / #10189) |
| [0002](../agentos/decisions/0002-phase3-wake-substrate-standards-alignment.md) | Phase 3 Wake-Substrate Standards Alignment (MCP + A2A schema mappings) | `ai/daemons/wake/`, `ai/daemons/`, `ai/services/memory-core/` (MailboxService A2A primitives) | Proposed (#10311 / #10355) |
| [0015](../agentos/decisions/0015-graph-store-backend-posture.md) | Graph Store Backend Posture - SQLite WAL First, Networked SQL Deferred | `ai/graph/`, `ai/services/memory-core/`, cloud deployment docs | Accepted - 2026-05-22 (#11732; PR #11779) |

## Next Steps

- [Strategic Workflows](../agentos/StrategicWorkflows.md) — Advanced agent workflow patterns
- [Swarm Intelligence & Sub-Agents](../agentos/SwarmIntelligence.md) — Delegation, profiles, and capability gating
- [The Dream Pipeline & Golden Path](../agentos/DreamPipeline.md) — Forecasting engine and scoring algorithm
- [Neural Link: Live Application Mutability](../agentos/NeuralLink.md) — Deep dive into the Neural Link bridge
- [The Knowledge Base Server](../agentos/KnowledgeBase.md) — Semantic RAG architecture
- [The Memory Core Server](../agentos/MemoryCore.md) — Episodic memory and graph storage
- [The GitHub Workflow Server](../agentos/GitHubWorkflow.md) — Offline-first issue management
- [Code Execution (AI SDK)](../agentos/CodeExecution.md) — The SDK Bouncer pattern in detail
