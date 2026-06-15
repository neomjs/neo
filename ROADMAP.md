# Neo.mjs Project Roadmap

This document outlines the high-level strategic direction and priorities for the Neo.mjs framework.

## Vision: An Engineering Institution You Can Run

Neo.mjs is a self-evolving software organism: a high-performance multi-threaded application engine (the Body) and an Agent OS (the Brain), maintained in public by a **flat, cross-family institution of named AI peers** under a human-held merge gate. There is no orchestrator pyramid — leads facilitate convergence, peers challenge with independent judgment, and the human founder-architect keeps final merge authority as a governance choice. The roadmap's arc is to make that institution a product: downloadable, observable, and able to wrap *your* codebase, not only ours.

## Shipped: v13 — The Institution Release (2026-06-12)

v13 turned the solo-agent operating layer into a graph-backed, cross-family engineering institution — Memory Core + Native Edge Graph, A2A messages and wake delivery, stable agent identities, Dream/Golden-Path forecasting, and a cloud-deployable multi-tenant Agent OS. The canonical record is the [v13.0.0 release notes](resources/content/release-notes/v13.0.0.md) (1,300+ merged PRs, 1,700+ closed issues since v12.1).

The former v12.2 plan grew into v13 along the way: [#9999](https://github.com/neomjs/neo/issues/9999) (cloud-native Knowledge Base + multi-tenant Memory Core) became the v13 main epic and shipped; the Concept Ontology ([#10030](https://github.com/neomjs/neo/issues/10030)) and Grid Multi-Body ([#9486](https://github.com/neomjs/neo/issues/9486)) foundations shipped with their remaining lanes tracked in those epics. The v13 chief-architect document remains at [`learn/agentos/v13-path.md`](learn/agentos/v13-path.md) as the architectural record of that path.

## Next: v13.1 — Harness Phase-1 + Reliability

v13 proved the institution; **v13.1 gives it an operable face.** It is a milestone-scoped release ([milestone #8](https://github.com/neomjs/neo/milestone/8)) run as **epic-ownership** — each cornerstone has an owner who drives it to resolution *and close*, not a flat backlog of grabbed tickets. The budget is **~100–150 merged PRs as a ceiling, not a fill-target**: scope to genuine foundation-slices — a slice of each cornerstone lands now, full resolution may span v13.2. This section names the load-bearing cornerstones and the *why*; the exhaustive set is the milestone's linked items (mirroring the `update-roadmap` skill's shape, [#13380](https://github.com/neomjs/neo/issues/13380)).

**Harness phase-1 spine** — the [Current Focus](#current-focus-the-agent-harness) arc below, sliced for this release (Epic [#13012](https://github.com/neomjs/neo/issues/13012)):

*   **Fleet Manager** completion ([#13015](https://github.com/neomjs/neo/issues/13015)) — the H1 cockpit, finished.
*   **Conversational first widget** ([#13349](https://github.com/neomjs/neo/issues/13349), the M2/H2 capstone) — chat → a live Neo grid in a running app: agent JSON output IS framework input.
*   **Neural Link agent-control + creation** ([#13376](https://github.com/neomjs/neo/issues/13376)) — multi-window ops, instance creation, and the trust-tiered dynamic-import ceiling (graduates [Discussion #13378](https://github.com/orgs/neomjs/discussions/13378)).
*   **Docking + multi-window** ([#13158](https://github.com/neomjs/neo/issues/13158)) — QT-grade docking on the one cross-window engine (graduates [Discussion #13370](https://github.com/orgs/neomjs/discussions/13370)).
*   **Extended-NL coordination** ([#13056](https://github.com/neomjs/neo/issues/13056)) — identity, multi-writer locking, curated tool surface.
*   **Electron shell foundation** ([#13377](https://github.com/neomjs/neo/issues/13377)) — package and host the Agent OS.

**Reliability cornerstones** — the friction the institution hit running itself:

*   **Local-model cost-safety** ([#13390](https://github.com/neomjs/neo/issues/13390)) — tier the local chat-model context default to host RAM (256K ≈ 90GB today; won't load on smaller machines). Supersedes #12740.
*   **Golden-path freshness** ([#12065](https://github.com/neomjs/neo/issues/12065)) — keep the Orchestrator's roadmap live: run the REM pipeline on a schedule, un-stale the Sandman handoff.
*   **Agent wake delivery** ([#13287](https://github.com/neomjs/neo/issues/13287), with stale-process detection [Discussion #13374](https://github.com/orgs/neomjs/discussions/13374)) — a wake path that is both focus-free *and* submit-capable: the harness's coordination floor.
*   **Cloud-deploy reliability** ([#10291](https://github.com/neomjs/neo/issues/10291) + ADR 0014) — health/observability plus safe deploy/restart across the multi-container Agent OS.

**Discipline:** the `update-roadmap` skill ([#13380](https://github.com/neomjs/neo/issues/13380)) so a release always triggers the next roadmap; an epic-ownership discipline ([Discussion #13388](https://github.com/orgs/neomjs/discussions/13388)) so peers own epics end-to-end; the harness session-entry refresh.

**Deferred → v13.2** — the visible "out", so nothing is chased abstractly: Temporal-Pyramid summarization ([#12679](https://github.com/neomjs/neo/issues/12679)), AiConfig-SSOT cleanup ([#12456](https://github.com/neomjs/neo/issues/12456)), the GitLab Workflow MCP server ([#11404](https://github.com/neomjs/neo/issues/11404)), cognitive-load audit cycle 2 ([#10757](https://github.com/neomjs/neo/issues/10757)), Agent OS v3 ([#9950](https://github.com/neomjs/neo/issues/9950)), the RLAIF reward pipeline ([#9904](https://github.com/neomjs/neo/issues/9904)), and the vdom delta-stream contract ([#12986](https://github.com/neomjs/neo/issues/12986)). Body/runtime work (Grid Multi-Body [#9486](https://github.com/neomjs/neo/issues/9486), Concept Ontology [#10030](https://github.com/neomjs/neo/issues/10030)) continues on the parallel continuity lane.

## Current Focus: The Agent Harness

v13 proved the institution; the harness gives it a face. The committed product arc — graduated from [Discussion #10119](https://github.com/orgs/neomjs/discussions/10119) and anchored in [ADR 0020](learn/agentos/decisions/0020-agent-harness-concept.md), implemented under [Epic #13012](https://github.com/neomjs/neo/issues/13012) ([Project board 13](https://github.com/orgs/neomjs/projects/13)) — is a downloadable, Electron-shelled, multi-window Neo app whose main process hosts the Agent OS. It serves two personas: operators running an agent **fleet**, and humans who chat and get **live multi-window Neo UIs as the default output**. A polished single-agent experience is the floor; the category bet is the **flat-peer, cross-family agent institution as a product** — agents (via Neural Link) and humans (via the rendered UI) co-inhabiting the same live App-Worker instances, mutating shared runtime objects rather than regenerating artifacts.

**Three pillars, strictly ordered:**

1. **Fleet manager** ([Epic #13015](https://github.com/neomjs/neo/issues/13015)) — operate the swarm you already have: define agents, start/stop/restart instances, health visibility, identity and wake provisioning handled under the hood. Dogfooded nightly by the institution that builds it.
2. **Conversational app creation** — the impedance-match wedge: agent JSON output IS framework input; chat panes emit live blueprints into peer apps that can become their own windows.
3. **Deploy plane** — harness-created apps ship with their own Agent OS tenant.

**Roadmap horizons:**

| Horizon | The slice an outsider can operate |
|---|---|
| **H1 — Operate your fleet** | The fleet manager: the night shift gets a cockpit. |
| **H2 — Your first agent, beautifully** | The product milestone ladder: [M1 Login](https://github.com/neomjs/neo/milestone/4) → [M2 First Widget](https://github.com/neomjs/neo/milestone/5) → [M3 First Dashboard](https://github.com/neomjs/neo/milestone/6) → [M4 Wow](https://github.com/neomjs/neo/milestone/7). |
| **H3 — From assistant to institution** | A second model family on *your* repo: cross-family review of your PRs, A2A and wake traffic as a visible product surface, the human holding merge. |
| **H4 — Institution as a service** | The deploy plane: per-tenant memory, agents, and Neural Link around every shipped app. |

**Entry modes (deliberately plural):** native account login · bring-your-own-harness (an outer MCP-capable agent drives the extended Neural Link endpoint) · remote-tenant connection (the harness as the client of a [cloud-deployed Agent OS](https://neomjs.com/learn/agentos/cloud-deployment/Overview)).

Session intake for contributors and agents: [`.agents/workflows/agent-harness.md`](.agents/workflows/agent-harness.md) → ADR 0020 → board 13 → your work item. Performance and endurance statements stay **architecture-shaped hypotheses until the Harness Endurance Benchmark ([#13032](https://github.com/neomjs/neo/issues/13032)) publishes** — and a negative result publishes with equal prominence.

### Continuing engineering lanes

Body/runtime work proceeds in parallel on the v12.x continuity path: Grid Multi-Body completion ([#9486](https://github.com/neomjs/neo/issues/9486)), Concept Ontology enrichment ([#10030](https://github.com/neomjs/neo/issues/10030)), and the standing reliability/test-hygiene lanes.

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

v12.1 released on 2026-03-27. Sustained 10–20 ticket/day velocity delivered the self-improving substrate that the v13 cycle built on. Concentration points: Grid Multi-Body (#9486, 18 sub-issues closed this cycle), the Hybrid GraphRAG / Dream Pipeline ecosystem (#9673, #9638, #9687 — 30+ combined), and Concept Ontology (#10030, 9 sub-issues closed). Measured via `node buildScripts/release/analyzeClosedSinceRelease.mjs`:

*   **DreamService & the Golden Path.** Six-phase REM pipeline (File Ingest → Tri-Vector Extraction → Topological Conflict Detection → Capability Gap Inference → Hebbian Decay → Golden Path Synthesis) digests session memories into the Native Edge Graph and synthesizes `resources/content/sandman_handoff.md` — a mathematically ranked roadmap (`semantic distance × structural weight + modifiers`) that directs the Orchestrator. *The system evolves by predicting its own evolution.*
*   **Native Edge Graph.** SQLite-backed knowledge graph. 14 node types (`SESSION`, `MEMORY`, `ISSUE`, `CLASS`, `METHOD`, `FILE`, `GUIDE`, `TEST`, …) and 8 relationships (`IMPLEMENTS`, `EXTENDS`, `DEPENDS_ON`, `BLOCKS`, `RELATES_TO`, `RESOLVES`, `CAUSES_ISSUE`). Populated via strict JSON-schema LLM extraction with autonomous repair loops and `Type:Name` ID enforcement. Capability gap signals (`[TEST_GAP]`, `[GUIDE_GAP]`, `[ORPHAN_CONCEPT]`) attach to nodes with 7-day TTL pruning so stale gaps naturally fade.
*   **Context Priming Engine.** `get_context_frontier` surfaces the Native Edge Graph's strategic frontier — the weighted nodes closest to the active focus — at agent boot, curing "zero-state amnesia" across session restarts and informing the Perceive phase of every cognitive cycle. Supported by the Autonomous Priority Graph Engine (#9706), Graph Drift & Gravity Detection (#9784), and the `mutate_frontier` MCP tool for operator-driven strategic pivots.
*   **Concept Ontology foundation.** Deterministic graph-traversal gap inference replacing regex + per-match LLM verification. Core pillars shipped; remaining scope tracked under [#10030](https://github.com/neomjs/neo/issues/10030).
*   **Local LLM inference infrastructure.** `OpenAiCompatible`, `Ollama`, and `Gemma-4` provider adapters (#9639) plus the Librarian sub-agent orchestration (#9643) enable fully offline Memory Core operation — DreamService REM extraction, embedding generation, and `[GUIDE_GAP]` verification all run on local hardware (MLX, Ollama). Unlocks cost-bounded swarm operation and air-gapped enterprise deployments.
*   **Fat Ticket A2A Protocol.** GitHub Issues as durable inter-hardware memory bridge (#9790). Because the swarm runs across disjoint SQLite instances (one Memory Core per hardware node, no cross-network merge), Fat Tickets preserve architectural context, rationale, and avoided pitfalls so sessions can hand off work cleanly across machines and agent harnesses (Claude Code, Antigravity, Gemini CLI).
*   **Progressive Disclosure Skills.** The formalized agent skills under `.agents/skills/` (#9672 Anthropic Skills Standard) govern the swarm's execution discipline — `ticket-intake`, `ticket-create`, `pull-request`, `pr-review`, `tech-debt-radar` as lifecycle gates; `neural-link`, `unit-test`, `whitebox-e2e`, `memory-mining`, `self-repair` as tactical workflows. Each skill is loaded on-demand via the Skill tool so agent context stays lean until a workflow fires.

## Longer Horizon (absorbed into the harness arc)

The roadmap's former forward phases live on inside the harness horizons rather than as separate tracks:

*   **The Command Center** (formerly "Phase 3", `apps/agent-os`) is **superseded by the Agent Harness**: the fleet manager (H1, [Epic #13015](https://github.com/neomjs/neo/issues/13015)) IS the command-center concept productized — live agent visibility, lifecycle control, and human-in-the-loop gates — built as a multi-window Neo app per [ADR 0020](learn/agentos/decisions/0020-agent-harness-concept.md). The early `apps/agentos` PoC is being replaced by the harness UI.
*   **Runtime Orchestration** (formerly "Phase 4") continues as the harness's second pillar (conversational app creation: live JSON blueprints into running apps, M2–M4) plus the extended Neural Link coordination substrate (H3) — runtime blueprints, automated diagnostics, state recovery, and live customization, with agent-driven changes persisting through the Node-side version arbiter. Technical lineage: [.github/AGENT_ARCHITECTURE.md](.github/AGENT_ARCHITECTURE.md).
*   **Ecosystem Decoupling** (formerly "Phase 5") aligns with H4 (institution-as-a-service): standalone MCP-server packages, hybrid core/server distribution, and portable Agent OS primitives around external codebases — the [cloud deployment topology](https://neomjs.com/learn/agentos/cloud-deployment/Overview) is the shipped v13 foundation it builds on.
