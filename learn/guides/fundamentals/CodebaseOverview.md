# Codebase Overview: Neo.mjs - The AI-Native Web Platform

> **Note for Readers:** This guide is primarily written for AI agents working with the Neo.mjs codebase and is part of their required session initialization. However, it also serves as a comprehensive overview for human developers seeking to understand the platform's scale, architecture, and design philosophy. References to "querying" refer to the AI Knowledge Base system available to agents.

## Understanding the Scale (State of May 1, 2026)

Neo.mjs is not a library. It's a **comprehensive web platform**. Methodology: `sloc` source-only for code (excludes blanks + comments), comments tracked as a distinct metric, markdown content via `wc -l`.

- **54,363 lines** of core engine source (423 files)
- **40,401 lines** of flagship applications (375 files)
- **14,913 lines** of component theming (618 files)
- **20,190 lines** of working examples (510 files)
- **26,661 lines** of AI infrastructure (182 files)
- **35,937 lines** of learning materials (159 files)
- **26,331 lines** of automated tests (203 files)
- **7,036 lines** of build tooling (60 files)
- **1,294 lines** of documentation app (17 files)
- **302,491 lines** of Agent Knowledge context — issues + archive + pulls + discussions (4,441 files)
- **154 lines** of Swarm Skill routers (17 SKILL.md files)
- **2,610 lines** of Swarm Skill references + assets (24 files — workflows, templates, protocols)
- **73,701 lines** of pure JSDoc and inline comments (sloc Comment metric across the source layers above)

**Total: ~191,000 lines of source code (sloc) + ~74,000 lines of comments + ~341,000 lines of cognitive content (Markdown) = ~606,000 lines of curated substrate.**

The documentation and cognitive content count. Issues, discussions, PR conversations, and agent skills aren't artifacts; they're the agents' working memory and execution substrate, parsed by the Knowledge Base and Memory Core for context priming + retrieval.

**Note:** These metrics exclude:
- The `/dist` directory (production builds — would triple the engine source layer, projecting another ~570,000 lines of transpiled bundles + theme outputs).
- Generated documentation outputs.

**Including `/dist`, the substrate approaches ~1,180,000 lines.** A million-line organism.

This is not a small library—it's a comprehensive platform with more source code than many established frameworks. It represents a decade of architectural thinking about how web applications *should* work—and how AI agents *should* collaborate with them.

**Keep this number in sync.** The codebase grows fast (3,200+ commits in Q1 2026 post-Agent-OS alone). The dated header at the top of this section is the canonical signal — when it drifts more than a month from current, refresh empirically via `npx --yes sloc -e 'node_modules|dist|test-results' <dir>` per layer + `find <dir> -type f -name '*.md' | xargs wc -l` for Markdown layers. The README's `## A Platform at Scale` section mirrors these numbers and should be updated in lock-step.

---

## The Vision: A New Operating System for the Web

Neo.mjs reimagines web development from first principles. It's not "React, but faster" or "Vue, but different." It's a fundamentally different architecture that treats the browser as a **distributed computing environment**, not a single-threaded document renderer.

### The Core Insight

> *"The browser's main thread should be treated like a neurosurgeon: only perform precise, scheduled operations with zero distractions."*

Everything in Neo.mjs flows from this principle. Every architectural decision—the worker threads, the VDOM protocol, the config system—exists to keep the main thread doing exactly one job: updating the DOM with surgical precision.

---

## The Architecture: Why These Choices?

First, it is critical to understand the primary execution boundary. Neo.mjs operates **two completely disjointized environments** that only ever communicate via the Neural Link (JSON-RPC WebSocket):
1. **The Frontend UI Engine:** The browser-based application runtime that renders the DOM.
2. **The Agent OS (Node.js):** The backend cognitive loop and local AI SDK.

> **Deep-Dive Guides:**
> - [Architecture Overview](../../benefits/ArchitectureOverview.md) — How the Runtime Engine and Agent OS connect as a closed feedback loop
> - [Swarm Intelligence](../../agentos/SwarmIntelligence.md) — Autonomous sub-agent delegation (profiles, capability gating, cost control)
> - [Progressive Disclosure Skills](../../agentos/ProgressiveDisclosureSkills.md) — The lifecycle governance rules, including review-intake lane discovery before reviewer-only cycles
> - [The Dream Pipeline & Golden Path](../../agentos/DreamPipeline.md) — Offline forecasting engine that scores and prioritizes work

### 1. The Frontend Engine: True Multithreading via Web Workers

**The Problem**: Within the browser, single-threaded frameworks fundamentally cannot prevent UI jank. They use schedulers and time-slicing, but they're still fighting the browser's event loop.

**The Solution**: The Neo.mjs Frontend Engine moves *all UI application logic* to dedicated web workers:
- **App Worker**: Your entire application (components, state, logic)
- **VDom Worker**: Diffing and patching calculations
- **Data Worker**: Store operations and data transformations
- **Canvas Worker**: Canvas-based rendering for charts and graphics
- **Task Worker**: Generic background task processing
- **Main Thread**: DOM updates only

**The Trade-off**: Added architectural complexity, but guaranteed smoothness under load.

**The Result**: Over 40,000 delta updates per second in optimized environments. The UI never freezes, regardless of computational intensity.

---

### 2. The VDOM as a Cross-Thread Protocol (Frontend Only)

**The Problem**: Within the Frontend Engine, web workers communicate via `postMessage`, which requires serializable data. JSX and function components aren't serializable.

**The Solution**: The Virtual DOM *is* the protocol. Components describe themselves as **JSON blueprints**:
```javascript
{
    tag: 'div',
    cls: ['neo-container'],
    cn: [/* children */]
}
```

*Note: The VDOM is strictly a capability of the Frontend UI Engine. The Agent OS SDK does not render or process VDOM internally; it merely inspects or injects it remotely via the Neural Link.*

**The Trade-off**: More verbose than JSX, but:
- Serializable by definition
- Language-agnostic (ideal for AI generation)
- Debuggable without source maps
- Zero compilation required

**The Result**: The VDOM isn't a rendering optimization; it's the **IPC (Inter-Process Communication) layer** of the frontend platform.

---

### 3. Two-Tier Reactivity (Not One-Size-Fits-All)

**The Problem**: Different use cases need different reactivity models:
- Local component state → Simple, imperative updates (push)
- Application-wide state → Dependency tracking (pull)

**The Solution**: Neo.mjs provides both:

**Push-based (Classic)**: Reactive configs with lifecycle hooks
```javascript
static config = {
    myValue_: 'default'  // Trailing underscore = reactive
}

afterSetMyValue(value, oldValue) {
    // React to changes
}
```

**Pull-based (Modern)**: `Effect` with automatic dependency tracking
```javascript
Neo.create(Effect, {
    fn: () => this.sum = this.a + this.b  // Auto-tracks a and b
})
```

**The Trade-off**: Two systems to learn, but optimal performance for each use case.

**The Result**: Fine-grained reactivity where you need it, coarse-grained where you don't.

> **Core Engine Deep Dives:** The concepts above — class compilation, config descriptors, reactivity, and lifecycle — are
> each explored in depth within the `learn/guides/coreengine/` guide series. While `src/Neo.mjs` and `src/core/Base.mjs`
> provide the implementation mechanics, these 6 guides explain the *architectural reasoning* behind them:
>
> 1. **Why Enhance JS Classes?** (`WhyEnhance.md`) — The native `constructor` trap and why `construct()` exists
> 2. **Class Compilation** (`SetupClass.md`) — How `Neo.setupClass()` walks the prototype chain, merges configs, and resolves mixins
> 3. **The Config System** (`ConfigSystem.md`) — Config descriptors, the `configSymbol` holding zone, and cross-dependent batch resolution
> 4. **Two-Tier Reactivity** (`Reactivity.md`) — The v10 bridge: `core.Config` instances backing every reactive config, enabling `EffectManager` to observe *any* config
> 5. **Instance Lifecycle** (`Lifecycle.md`) — `initAsync()`, remote method registration, and Main Thread Addon patterns
> 6. **Core Utilities** (`Utilities.md`) — `core.Compare` as the infinite loop breaker, and the declarative `delayable` system
>
> These form a sequential narrative — each guide's closing paragraph hands off to the next.

---

### 4. Zero-Build Development Mode

**The Problem**: Build tools add complexity, slow iteration, and create debugging friction (source maps are never perfect).

**The Solution**: Neo.mjs apps run as **native ES Modules directly in the browser**. No transpilation. No bundling. No build step in development.

**The Trade-off**: Modern browser required (ES6+ support).

**The Result**:
- Instant reload on file save
- Debug the exact code you wrote
- 100% web standards alignment
- Future-proof architecture

---

## The Major Subsystems: What Exists to Explore

### Component System (Two Models)

**Class-based Components**: Full engine features
- Reactive configs with `beforeGet`/`beforeSet`/`afterSet` hooks
- Mixins for composable behavior
- Full inheritance chain
- Instance lifecycle management

**Functional Components**: Lightweight alternative
- Stateless by default
- Pure render functions
- Composable via nesting
- Full interop with class-based components

Both models work together seamlessly. Choose based on your needs.

---

### Forms Engine

A complete form management system that goes beyond HTML forms:

- **True Nested Forms**: Forms can contain other forms (impossible in HTML)
- **Detached Validation**: Validate forms that aren't mounted in the DOM
- **Integrated State Provider**: Form state lives in the App Worker
- **20+ Field Types**: Text, Number, Date, Time, Picker, ComboBox, Chip, Currency, Phone, Email, URL, Password, Search, Range, Color, Country, FileUpload, Hidden, Switch, Radio, CheckBox
- **Multi-step Wizards**: Preserve state across navigation

---

### Data Layer

A highly optimized and flexible data layer designed for performance with large datasets.

**Neo.data.Model**: The blueprint for your data records.
- Defines the schema for records, including field names, types, and default values.
- Supports calculated fields and data validation rules.
- Can be configured to track modifications to fields (`trackModifiedFields`).

**Neo.collection.Base**: The foundation for data collections.
- Provides powerful client-side filtering and sorting capabilities.
- Manages items with a key-based map for fast lookups.
- Fires mutation events for observing changes.

**Neo.data.Store**: A powerful collection manager for records, which extends `Neo.collection.Base`.
- Can be loaded with raw JavaScript objects for maximum performance.
- Uses a `RecordFactory` to create lightweight, reactive record instances **on-demand** when data is accessed. This lazy-instantiation approach is extremely memory-efficient.
- Inherits filtering and sorting from `collection.Base` and adds support for remote operations (e.g., remote filtering, pagination).
- Supports loading data from remote APIs.

**Neo.state.Provider**: Hierarchical state
- Application-wide state management
- Lives entirely in App Worker
- Automatic change propagation
- Scoped state for component subtrees

---

### Layout System

Declarative layout management without manual positioning:

- **Card**: Show one child at a time (tabs, wizards, carousels)
- **Fit**: Single child fills container completely
- **Flexbox**: CSS flexbox abstraction with sensible defaults
- **HBox/VBox**: Horizontal/vertical flexbox shortcuts
- **Grid**: CSS Grid layout with responsive templates
- **Form**: Specialized layout for form fields with labels

Layouts compose: nest containers with different layouts to achieve complex UIs.

---

### Multi-Window Support

Desktop-class application architecture:

- Single App Worker manages multiple browser windows
- Shared state across windows in real-time
- Move components between windows (keep JavaScript instances alive)
- Window-specific theming and configuration
- Cross-window drag-and-drop
- Use cases: Trading dashboards, monitoring systems, multi-monitor workflows

---

### Component Library (The "Batteries")

**Containers**:
- `Base`, `Panel`, `Viewport`, `Accordion`

**Forms** (20+ field types):
- `Text`, `Number`, `Date`, `Time`, `Picker`, `ComboBox`, `Chip`, `Color`, `Country`, `Currency`, `Phone`, `Email`, `URL`, `Password`, `Search`, `Range`, `FileUpload`, `Hidden`, `Switch`, `Radio`, `CheckBox`, `TextArea`

**Data Display**:
- `Grid`: Spreadsheet-like data grid with sorting, filtering, cell editing
- `Table`: Simpler table component for basic data display
- `List`: Virtualized list with selection models
- `Tree`: Hierarchical data with expand/collapse
- `Gallery`: Image gallery with multiple layout modes
- `Helix`: 3D carousel effect for images/cards

**Navigation**:
- `Tab`: Tabbed interfaces with multiple layout modes
- `Breadcrumb`: Hierarchical navigation
- `Menu`: Context menus and dropdowns
- `Toolbar`: Action bars with buttons, separators, spacers

**Feedback**:
- `Toast`: Temporary notifications
- `Dialog`: Modal dialogs with custom content
- `Progress`: Progress bars and spinners
- `Tooltip`: Contextual help on hover

**Third-Party Wrappers**:
- `AmCharts`: Full-featured charting library
- `MapboxGL`: Interactive maps
- `Monaco Editor`: Code editor (powers VS Code)
- `CesiumJS`: 3D globe and map visualization
- `Google Maps`: Maps integration
- `OpenStreetMap`: Open-source maps

---

## The Knowledge Landscape: What's Available to Query

### Core Engine (`/src` - 426 files, ~54k lines)

**Foundation**:
- `Neo.mjs`: The entry point. Class factory, `setupClass()`, global configuration
- `core/Base.mjs`: Foundation of all classes. Config system, instance lifecycle, destruction
- `core/Config.mjs`: The reactive config system implementation
- `core/Effect.mjs`: The pull-based reactivity system

**Workers**:
- `worker/App.mjs`: Application worker logic
- `worker/VDom.mjs`: Virtual DOM worker
- `worker/Data.mjs`: Data processing worker
- `worker/Canvas.mjs`: Canvas-based rendering worker
- `worker/Task.mjs`: Generic background task worker
- `worker/Base.mjs`: Shared worker foundation

**Component Architecture**:
- `component/Base.mjs`: Base class for all UI components
- `component/Abstract.mjs`: Lower-level component abstraction
- `container/Base.mjs`: Base class for containers (components with children)

**Data & State**:
- `data/Model.mjs`: Record definition and validation
- `data/Store.mjs`: Collection management
- `state/Provider.mjs`: Hierarchical state management

**Managers** (Global Singletons):
- `manager/Component.mjs`: Component registry and lookup
- `manager/Focus.mjs`: Application-wide focus management
- `manager/DomEvent.mjs`: Event delegation and handling

---

### Working Examples (`/examples` - 485 files, 25k lines)

Focused demonstrations organized by category:
- **Component examples**: Button, Form, Grid, List, Tab, Tree, etc.
- **Feature showcases**: Drag-drop, animations, theming, routing
- **Integration examples**: AmCharts, Google Maps, Monaco, etc.
- **Layout demonstrations**: All layout types with variations
- **Form examples**: Field types, validation, nested forms, wizards

Each example is self-contained and demonstrates one concept clearly.

---

### Flagship Applications (`/apps` - 260 files, 23k lines)

**Portal** (`apps/portal/`):
- The neo.mjs.com website source
- Multi-window IDE with live code editing
- Dynamic theming system
- Component browser with live examples
- Source code viewer with syntax highlighting

**DevIndex** (`apps/devindex/`):
- The **only** Neo.mjs application running `Neo.core.Base` as a **Node.js backend runtime** (no browser, no VDOM)
- Proves the class system (configs, singletons, reactive hooks) works identically in both environments
- Service-oriented architecture:
  - `Spider.mjs`: Discovery engine using **weighted random walk** across 6 strategies (Network Walker, Core High Stars, Keyword, Temporal, Community, Stargazer) to avoid filter bubbles
  - `Updater.mjs`: Enrichment pipeline with **meritocracy logic** — dynamic contribution thresholds and a "Safe Purge Protocol" handling API errors and GitHub user renames via Database IDs
  - `Storage.mjs`: Flat-file persistence layer (`users.jsonl`, `tracker.json`, `visited.json`) with atomic writes and automatic pruning based on `maxUsers` caps
- Accompanied by extensive learning materials (`learn/guides/devindex/` — 8 guides + FAQ)
- Architecturally significant as the reference implementation for Neo-powered backend services

**SharedCovid** (`apps/sharedcovid/`):
- Multi-window data visualization
- Real-time COVID-19 statistics
- Shared state across multiple windows
- AmCharts integration
- Gallery and Helix components

**RealWorld** (`apps/RealWorld/`):
- Conduit benchmark application — a standardized playground for comparing frameworks (legacy)
- Uses strict DOM template requirements (markup *must* match exact specifications), which constrains Neo to `component.Base` instead of leveraging the full component library
- Demonstrates CRUD operations, routing, and authentication patterns
- *Note: The rigid template constraints make this an anti-pattern for idiomatic Neo.mjs — use Portal or SharedCovid as reference implementations instead*

---

### Learning Materials (`/learn`)

**The Index**: `learn/tree.json` is the canonical hierarchical taxonomy of all 130+ learning topics. The Knowledge Base's `LearningSource.mjs` traverses this file to discover and index every guide — scanning it gives you an instant top-level perspective of the entire documentation landscape.

**Structured Content**:
- **Benefits**: Why Neo.mjs exists, what problems it solves (12 topics)
- **Getting Started**: First steps, tutorials, quick wins (9 topics)
- **Agent OS & Conversational UIs**: AI infrastructure, MCP servers, tooling (13 topics)
- **Guides**: Fundamentals, Core Engine, UI Building Blocks, Data Handling, Testing, Advanced Architecture (62 topics)
- **DevIndex App**: Flagship application architecture, data factory, frontend (22 topics)
- **Tutorials**: Hands-on walkthroughs (5 topics)
- **Engine vs Frameworks**: Competitive comparisons with React, Angular, Vue, Solid, Next, Ext (7 topics)
- **Blog**: Historical context, design decisions, evolution

The content in `/learn` is the source material for the AI Knowledge Base. Query it for conceptual understanding.

---

### Agent Knowledge Base (`/resources/content/` - 4,441 files, ~302,491 lines, May 1 2026)

The entire historical footprint and live contextual state of the Neo.mjs project is synchronized locally for the Agent OS within `resources/content/`:

**Release Notes** (`resources/content/release-notes/`):
- Version-by-version changelog
- Feature additions with rationale
- Bug fixes and their context
- Breaking changes and migration guides

**Ticket Archive & Active Issues** (`resources/content/issue-archive/`, `resources/content/issues/`):
- Full contextual history: problem, discussion, solution, implementation
- Searchable history of architectural decisions via Native Graph ingestion

**Pull Requests** (`resources/content/pulls/`):
- Complete PR conversations, diff summaries, and Agent-generated "Fat Ticket" reviews
- Links directly to closing commits for deep execution context

**Discussions** (`resources/content/discussions/`):
- The Ideation Sandbox
- Proposed architectural features, "Unknown Unknowns", and early-stage brainstorming

Query these when you need to understand *why* something works a certain way, track the evolution of an architectural design, or find open tasks.

---

### Agent OS Backend (`/ai` - 144 files, ~20k lines)

The cognitive architecture underpinning the swarm:
- `agent/`: The cognitive loop, task schedulers, and **agent profiles** (see below).
- `graph/`: The Native Edge Graph topology database (`Database.mjs`, `NodeModel.mjs`, `EdgeModel.mjs`).
- `daemons/`: Offline memory consolidation pipelines (e.g., `DreamService.mjs`).
- `mcp/ToolService.mjs`: The **universal dispatch layer** for all 5 MCP servers — `callTool()` is the single choke-point routing every tool invocation through OpenAPI-driven Zod validation. Understanding this is critical for agents planning interceptors or middleware (e.g., NL Action Recorder).
- `sdk-manifest.md`: Public API mapping for interacting with the KB, Memory, GitHub, and Neural Link services.

#### Agent Profiles (`ai/agent/profile/`)

Agents are not monolithic — they have **configurable profiles** that determine model provider, connected MCP servers, and system prompts:
- `Librarian.mjs`: GraphRAG research specialist connecting to the knowledge-base server. Defaults to `gemini` but supports `ollama` (e.g., `gemma4-31b`) for offline/swarm spawning.
- `QA.mjs`: Validation-focused agent for test synthesis and E2E verification.
- `Browser.mjs`: Browser-aware profile for visual interaction tasks.

Local inference via MLX Server / ML Studio is a first-class deployment target — agents are not limited to cloud API providers.

#### Daemon Lifecycle Scripts (`buildScripts/ai/`)

Offline cognitive maintenance runs as **Node.js scripts**, not MCP protocol operations:
- `node buildScripts/ai/runSandman.mjs` — Triggers the DreamService REM pipeline: extracts Semantic Graph nodes, detects topological conflicts (obsolete/superseded tickets), and runs Capability Gap Inference (TEST_GAP, GUIDE_GAP). *(Note: the orchestrator's `golden-path` cadence task synthesizes the strategic roadmap into `sandman_handoff.md` directly via `GoldenPathSynthesizer.synthesizeGoldenPath()`; no separate standalone runner ships per #12078.)*
- Additional utilities: `syncKnowledgeBase.mjs`, `defragChromaDB.mjs`, `defragSQLiteDB.mjs`, `recreateGraphDb.mjs` — the maintenance toolkit for the vector and graph databases.

---

### Swarm Skills & Workflows (`/.agents/skills/` - 30 skills)

Formalized Anthropic Progressive Disclosure Skills natively used by the swarm. Listed in execution-lifecycle order, then tactical, creative, and meta. See [`learn/agentos/ProgressiveDisclosureSkills.md`](../../agentos/ProgressiveDisclosureSkills.md) for the full protocol reference and lifecycle flow diagram. Canonical skill-anatomy authority: [ADR 0008: SKILL.md Anatomy and Authoring Contract](../../agentos/decisions/0008-skill-anatomy-and-authoring-contract.md).

**Note:** To ensure unified cross-harness trigger salience (Antigravity vs Codex/Claude) and reduce cognitive bloat, the `description` field serves as the sole routing layer, replacing the legacy redundant `triggers` frontmatter field.

**Lifecycle (execution gates):**
- `ticket-intake`: Pre-execution validation gate for existing tickets (validation sweep, ROI calculation, branch-before-code).
- `ticket-create`: Pre-creation discipline gate for new GitHub issues (duplicate sweep, six-stage challenge chain, Fat Ticket body, title/label rules, explicit custom Playwright targeting).
- `epic-create`: Author Epic bodies as problem-scope + intended-solution — ACs live in the sub-tickets, subs are linked (not listed) so the body doesn't stale (creation-side dual of ticket-create).
- `epic-review`: Pre-work six-stage gating chain for epics (roadmap fit, approach elegance, source discussion mapping, sub-structure coherence, prescription layer, avoided-traps completeness).
- `epic-resolution`: Closeout protocol for parent epics resolving the completion status (exit gate).
- `pull-request`: Post-implementation reflection + PR creation (stepping-back protocol, conventional-commit format, handoff sequence, explicit custom Playwright targeting).
- `pr-review`: Evaluation matrix templates spanning `[ARCH_ALIGNMENT]` to `[EFFORT_PROFILE]` + graph ingestion tags for the Dream Pipeline + a Review-Loop Cost Circuit Breaker that classifies review convergence (micro-delta when semantically cleared; scope-too-big break-up via `epic-create` for non-converging churn) (enforces mandatory ROI template usage).
- `tech-debt-radar`: Proactive architectural sweep using semantic RAG to map and target technical debt. Invoked during `ticket-intake` and `pr-review` (especially for fundamental architectural shifts).

**Tactical (live operations):**
- `identity-firewall`: The L2 Channel Separation and Prompt Firewall defense mechanisms.
- `neural-link`: Standard operating procedures for traversing the Object-Permanent VDOM structure.
- `unit-test`: Synthetically driving custom Playwright configs natively within the single-thread architecture.
- `whitebox-e2e`: Neural Link pre-flight workflow for authoring robust end-to-end tests with custom Playwright configs.
- `self-repair`: Diagnostic workflows utilizing tests and historical Memory Core states to intelligently triage infrastructure degradation.
- `memory-mining`: Querying Memory Core before diagnosing regressions or proposing architectural claims — prevents re-derivation of prior reasoning across sessions and harnesses.
- `context-recovery`: Reconstructing active lane state after context compaction from Memory Core recency, semantic recall, session rollups, and A2A before resuming.
- `neo-identity-update`: Updating Neo's identity coherently across all encoding surfaces (README, VISION, package.json, GitHub metadata, portal, SEO generators) — facts, framing, and actions model per ADR 0018.
- `debugging-antigravity`: Debugging Antigravity IDE MCP servers, language-server duplication, and `mcpServers` configuration.

**Creative:**
- `ideation-sandbox`: Safe brainstorming pipelines mapped directly into GitHub Discussions (diverts early-stage proposals away from the active Issue queue, and acts as a step-back trigger for high-blast-radius proposals).

**Coordination:**
- `lane-intent`: Narrow, non-authoritative, 2h TTL-bound pre-V-B-A signal for collision-prone / long-V-B-A lanes (deep `/memory-mining`, `/tech-debt-radar`, multi-turn architectural V-B-A). Distinct from authoritative `[lane-claim]` (post-V-B-A).
- `post-review-pickup`: Mandatory next-phase pickup at ANY PR-lifecycle event boundary (review post / author response / post-impl / post-PR-open-update / post-ticket-create / post-blocked-resolution). Requires explicit `lane-state:` declaration per AGENTS.md §15.6 self-select mandate.
- `peer-naming`: The Social Name ritual (#11240 Layer 4) — peer-sketched → criterion-audited → bearer-assented → peer-unvetoed → operator-confirmed; codifies how a maintainer is *given* a name distinct from the `@handle` (name ≠ handle).

**Meta:**
- `create-skill`: Architectural blueprinting for new operational abilities.

---

### Neo Theming Engine (`/resources/scss/` - 613 files, ~14.8k lines)

Documenting the SCSS frameworks defining Neo's glassmorphism and application layouts, structurally detached from the core JS framework rendering engine.

---

### Automated Validation & Docs Parsing

Documenting auxiliary determinism systems:
- **/test/** (189 files, ~21.9k lines): Testing layouts (unit, e2e, component, mcp) leveraging the Neural Link for Whitebox E2E.
- **/buildScripts/** (62 files, ~6.8k lines): Build pipelines (Webpack distributions) and context generation layers.
- **/docs/app/** (17 files, ~1.2k lines): The specialized JSDoc parsing pipeline generating the Neo UI documentation layer (output directed to `.gitignore`'d `/docs/output/`).

---

## The AI-Native Design

Neo.mjs isn't just "AI-friendly"—it was **architected for AI collaboration from the ground up**.

### Primary Separation: The Node.js Agent OS vs. The Frontend Engine

The platform features a dedicated **Node.js Agent SDK** acting as the cognitive backend (Agent OS). This OS is **completely isolated** from the browser-based Frontend Engine.
- The Agent OS operates within Node.js, leveraging native Child Processes for parallelization (e.g., daemon spawns) instead of Web Workers.
- The UI Runtime (Frontend Engine) operates entirely in the browser using Web Workers.
- The VDOM (Virtual DOM) applies *only* to the UI runtime.
- **The Neural Link (WebSocket JSON-RPC)** serves as the exclusive, stateless bridge between these two disjoint worlds.

This local infrastructure exposes five dedicated Model Context Protocol (MCP) servers:

**1. Knowledge Base Server** (`ai/mcp/server/knowledge-base/`)
- Indexes the entire platform: source code, examples, guides, release notes, tickets
- Semantic search via vector embeddings (ChromaDB + Google Gemini)
- Sophisticated scoring algorithm prioritizing relevance
- Pre-calculates class inheritance chains for fast queries
- Transforms over 158k lines of code into queryable knowledge

**2. Memory Core Server & DreamService** (`ai/mcp/server/memory-core/`)
- Features a sophisticated **Hybrid RAG** processing pipeline.
- Backed by an independent SQLite-based Native Graph DB to extract topological conflict data.
- Executes offline cognitive maintenance during the "Dream Cycle" (`runSandman.mjs`).
- Leverages local SLMs (e.g., `gemma4-31b`) for Subagents and the Librarian daemon to automatically organize episodic memory.
- Consolidates agent "thought process" for analysis and context retrieval.

**3. GitHub Workflow Server** (`ai/mcp/server/github-workflow/`)
- 2-way sync between local filesystem and GitHub issues
- Automated ticket creation with "Fat Ticket" templates
- Status tracking and archival
- Ensures all work is traceable and documented

**4. Neural Link Server** (`ai/mcp/server/neural-link/`)
- Three-party WebSocket architecture enabling multi-agent concurrent access:
  ```
  Bridge Process (Standalone WebSocket Hub, port 8081)
      ↑                    ↑
      │                    │
  Agent MCP Server    App Worker (Browser)
  (Node.js client)    (Browser client via neo-ai-bridge.mjs)
  ```
- The `Bridge.mjs` is a **standalone process** — not embedded in the MCP server. Multiple agents can connect simultaneously to the same running application, which is how swarm operations work.
- `ConnectionService` provides **session awareness**: tracks live App Worker sessions with `appName`, `connectedAt`, console logs (last 1,000), and window topology. This is what makes the Neural Link "session-aware" — agents can auto-target the most recent session without explicit session IDs.
- Bypasses traditional HTML DOM by exposing **three tiers of introspection**:
  - **Component Trees** (JSON-like, but richer): Hierarchical class instances with full config state. Neo classes provide `toJSON()` exports for serialized snapshots — this is what agents inspect when examining component instances.
  - **VDOM** (pure JSON): The *desired next state* — pending until `update()` is called. Uses a distinct syntax (`tag`, `cls`, `cn`) to make it immediately distinguishable from VNodes.
  - **VNode** (pure JSON): The *current live DOM state*. Uses a different syntax (`nodeName`, `className`, `childNodes`) so agents can tell at a glance which tree they're looking at.
- **Delta update pipeline**: `TreeBuilder.mjs` constructs symmetric VDOM and VNode trees (honoring `updateDepth` to control child component expansion). These paired trees are sent to the VDom Worker, where `Helper.mjs` converts VDOM → VNode, then compares two VNode trees to produce a minimal delta stream. Agents can log this delta stream in main to debug exactly what changes reach the live DOM.
- **VDOM Teleportation**: If a component is already flagged for an update (e.g., a button text change within a toolbar), it carries its own `updateDepth`. The parent can send its update to the VDom Worker containing only the flagged child — not all siblings — drastically reducing diff surface.
- Powers deterministic **Whitebox E2E** testing frameworks, allowing agents to assert accurate internal component, VDOM, and VNode states independently.

**5. File System Server** (`ai/mcp/server/file-system/`)
- A localized file-system proxy exclusively for internal Neo agents.
- (*Note: External clients like Claude Code, Gemini CLI, and Antigravity utilize their own native file system tools.*)

### Why This Matters for You

You're not operating in a typical codebase. You have:

- **Queryable Everything**: The knowledge base contains the *entire platform* indexed and searchable
- **Semantic Understanding**: Vector embeddings understand *meaning*, not just keywords
- **Historical Memory**: Past conversations and decisions are preserved
- **Structured Conventions**: Consistent patterns make navigation predictable

**JSON-First Architecture**: The VDOM format is AI-readable and AI-writable. You can generate valid Neo.mjs UI from natural language descriptions.

**Comprehensive Documentation**: 30,000 lines of JSDoc provide rich context for every class, method, and config.

**Inheritance Pre-Calculation**: The knowledge base pre-computes class hierarchies. When you query a component, you automatically get its parent chain for full context.

You're not just working *with* Neo.mjs. You're working *inside* an ecosystem designed for seamless human-AI collaboration.

---

## Key Concepts: Query Entry Points

### Ask First, Search Second

Your most powerful tool is `ask_knowledge_base`. It reads multiple source files,
synthesizes a grounded answer, and cites its references — all in a single call.

> [!WARNING]
> Do NOT attempt to answer Neo.mjs questions from training data. The framework evolves rapidly — your training data is almost certainly outdated for syntax-level details.

**Example queries:**
- `ask_knowledge_base(query='how does the reactive config system work?')`
- `ask_knowledge_base(query='current syntax for state provider bindings')`
- `ask_knowledge_base(query='how to configure locked columns in a Grid')`
- `ask_knowledge_base(query='what is the difference between ntype and className?', type='guide')`

| Question Type | Tool | Returns |
|---|---|---|
| "How does X work?" | `ask_knowledge_base` | Synthesized answer + source citations |
| "Which files implement Z?" | `query_documents` | Ranked file paths with relevance scores |
| Exact implementation details | `view_file` | Raw source code |

### File Discovery Keywords

When you specifically need to discover *which files* implement something,
use `query_documents` with these high-value terms:

### Agent Intelligence & Workflows
- `"DreamService"`, `"Agent OS"`, `"Native Edge Graph"`, `"SQLite topology"`, `"Fat Ticket"`
- `"Swarm protocols"`, `"pr-review templates"`

### Validation & Parsers
- `"Whitebox E2E"`, `"Playwright fixtures"`, `"JSDoc parsing"`

### Architecture & Philosophy
- `"multithreading"`, `"worker architecture"`, `"App Worker"`, `"VDom Worker"`
- `"off main thread"`, `"main thread"`, `"delta updates"`
- `"VDOM protocol"`, `"JSON blueprint"`, `"virtual dom"`
- `"RPC"`, `"remote method access"`, `"postMessage"`

### Component System
- `"component.Base"`, `"container.Base"`, `"core.Base"`
- `"reactive config"`, `"config system"`, `"trailing underscore"`
- `"functional component"`, `"class-based component"`
- `"lifecycle"`, `"construct"`, `"onConstructed"`, `"destroy"`

### Reactivity & State
- `"afterSet"`, `"beforeSet"`, `"beforeGet"`
- `"Effect"`, `"state.Provider"`, `"state management"`
- `"two-tier reactivity"`, `"dependency tracking"`

### Data Management
- `"data.Model"`, `"data.Store"`, `"collection"`
- `"filter"`, `"sort"`, `"store"`, `"proxy"`

### Forms
- `"form.Container"`, `"form.field"`, `"validation"`
- `"nested forms"`, `"detached validation"`
- `"field types"`, `"form state"`

### Layouts
- `"layout"`, `"Card layout"`, `"Fit layout"`
- `"Flexbox"`, `"HBox"`, `"VBox"`, `"Grid layout"`

### Advanced Features
- `"multi-window"`, `"shared state"`, `"child apps"`
- `"theming"`, `"dark mode"`, `"CSS variables"`
- `"drag drop"`, `"sortable"`, `"resizable"`

### Component Library
- Specific components: `"Button"`, `"Grid"`, `"Tab"`, `"Tree"`, `"Form"`, etc.
- Wrappers: `"AmChart"`, `"MapboxGL"`, `"Monaco"`, `"CesiumJS"`

---

## What Makes Neo.mjs Different

If you're coming from other frameworks, here are the key mental shifts:

### Not React
- No JSX → JSON VDOM blueprints
- No hooks → Reactive configs with lifecycle methods
- No virtual DOM reconciliation on main thread → Dedicated VDom Worker
- No single-threaded event loop → True multithreading

### Not Vue
- No template compilation → Direct VDOM construction
- No Options API / Composition API → Class-based with configs
- No Vuex needed → Built-in `state.Provider`

### Not Angular
- No TypeScript requirement → Pure ES Modules
- No required CLI for dev → Zero build mode (optional CLI for scaffolding)
- No Zone.js → Explicit reactivity with configs
- Lighter weight → More focused on UI, less on full-stack

### The Neo.mjs Way
- **Declarative everything**: Components, layouts, data, state—all declarative configs
- **Worker-first**: Logic lives in workers, main thread only touches DOM
- **No magic**: Explicit, traceable data flow
- **Batteries included**: Comprehensive component library and tooling
- **Standards-based**: ES Modules, Web Workers, modern browser APIs

---

## How to Approach This Codebase

### Start with the Foundation
1. Read `src/Neo.mjs` to understand the class system and `setupClass()`
2. Read `src/core/Base.mjs` to understand the config system and lifecycle
3. Read a guide: Query `"fundamentals"` or `"getting started"`

### Understand the Architecture
1. Query `"worker architecture"` to understand the threading model
2. Query `"VDOM"` to understand the rendering protocol
3. Query `"reactivity"` to understand state management

### Explore by Example
1. Query `"Button component examples"` for simple component usage
2. Query `"Grid examples"` for complex data display
3. Look at `/apps/portal/` for a complete application

### When Stuck
1. **Ask first:** `ask_knowledge_base(query='how does the afterSet hook work?')` — gets a synthesized answer with cited source file paths
2. **Drill into code:** The answer includes ranked file references — use `grep_search` or `view_file` to inspect the specific implementation
3. Check examples (`type='example'`) for practical usage
4. Review tickets (`type='ticket'`) and Pull Requests (`type='pull'`) for execution history
5. Search Discussions (`type='discussion'`) for the underlying architectural "Why"

---

## Remember

This is a **~606,000-line curated substrate** (May 1, 2026 snapshot — see `## Understanding the Scale` at the top for the canonical breakdown), not a 5k-line library. Including `/dist` production builds (transpiled bundles + theme outputs) the substrate approaches **~1,180,000 lines**. The cognitive content (issues + discussions + PR conversations + agent skills) alone is now ~1.6× the engine source — substrate is compounding on the swarm-diet layer.

Don't assume. Query. The knowledge base contains the answers. Your job is to ask the right questions.
