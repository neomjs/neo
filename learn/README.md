# Neo.mjs Learning Base

Neo.mjs is a complete application platform — 459 classes from grid to forms to calendar to dashboards — for every desktop and mobile web application, with a multi-threaded runtime that goes where single-threaded libraries cannot. It builds the applications teams build with [Angular, React or Vue](./comparisons/Overview.md) today, at [feature parity with Ext JS](./comparisons/NeoVsExtJs.md) and beyond it in architecture, for desktop and mobile browsers.

These Markdown documents power the interactive learning portal on [neomjs.com](https://neomjs.com/#/learn) (complete with live editable previews that can tear out into separate browser windows) and serve as the primary documentation corpus for the **Neo.mjs Knowledge Base MCP Server**.

## Why Neo.mjs Is a Paradigm Shift: Two Hemispheres, One Runtime Contract

Neo.mjs is not a single-threaded UI framework. It is the **only JavaScript application engine** where component instances, reactive state, and virtual DOM diffing live entirely off the browser's main thread and remain directly inspectable and mutable at runtime by AI coding agents across two connected hemispheres joined by the **Neural Link**:

1. **The Body (`/src/`, `neomjs/neo` — Off-Main-Thread Application Engine):**
   - **App Worker as the Primary Actor:** All components, controllers, `state.Provider` trees, and `data.Store` instances (`100,000`-row buffered grids) execute inside a dedicated `App` Worker (or a `SharedWorker` spanning multiple browser windows).
   - **40,000+ Delta Updates/Sec Without Main-Thread Jank:** Virtual DOM diffing runs in a dedicated `VDom` Worker (`src/worker/VDom.mjs` → `src/vdom/Helper.mjs`), sustaining [`40,000+` delta updates per second](./benefits/body/Speed.md) in the Helix benchmark while the main thread stays completely free for 60fps user input and CSS compositing.
   - **True Multi-Window Object Permanence:** Because component instances live in the worker heap rather than transient main-thread render closures, live views and docked panels can detach from one browser window and mount into another (`remove(cmp, false)`) in milliseconds without losing state.
   - **Zero-Build Native ES Modules:** Run and debug unbundled ES modules directly in the browser in `dev` mode with zero transpilation or bundler step.
2. **The Brain (`/ai/`, `neomjs/neo-agent-brain` & `neomjs/neo-agent-institution` — Agent OS):**
   - **Humans Are the Orchestrators; LLMs Are the Builders:** Paired with a persistent Native Edge Graph, Memory Core, Knowledge Base, and Fleet Manager cockpit, Neo.mjs treats AI agents as first-class maintainers.
   - **Live Runtime Possession via the Neural Link:** Through the [Neural Link](./agentos/NeuralLink.md)'s MCP tools, coding agents inspect live component trees, query `state.Provider` hierarchies, simulate DOM events, and hot-patch class methods inside running applications without page reloads.

---

## Where to Start — Three Reader Paths

### 1. Evaluating or Building with the Application Engine (Developer Path)
If you are building single-window or multi-window web applications, high-density data grids, or reactive workspaces:
1. **[Introduction](./benefits/Introduction.md)** & **[Architecture Overview](./benefits/ArchitectureOverview.md):** How the Off-Main-Thread worker topology, JSON blueprints, and the Neural Link fit together.
2. **[Getting Started](./gettingstarted/Workspaces.md):** Create your first workspace (`npx neo-app`), run unbundled ES modules in `dev` mode, and inspect how components mount across workers.
3. **[Guides](./guides/fundamentals/CodebaseOverview.md):**
   - **Fundamentals & Core Engine:** Class system (`Neo.setupClass`), reactive config descriptors (`beforeSet*` / `afterSet*`), and component lifecycle.
   - **Data Handling & Grids:** `Neo.data.Store`, `Neo.data.Model`, hierarchical `state.Provider`, and buffered `Neo.grid.Container` rendering.
   - **UI Building Blocks & Multi-Window Docking:** The 10-part dock-layout and cross-window tear-out shelf (`DockContainer`, `DockZone`, `Workspace`, `Perspectives`).
4. **[Tutorials](./tutorials/DockLayoutsFirstLayout.md):** Step-by-step application walkthroughs with runnable live-preview examples.

### 2. Evaluating Neo.mjs for an Enterprise Application (Evaluator Path)
If you are evaluating Neo.mjs for trading/telemetry desks, multi-monitor workspaces, or large-scale data grids:
1. **[Introduction (Claims & Proof Register)](./benefits/Introduction.md):** Every architectural claim paired with its source coordinate, test suite, or reproducible benchmark receipt.
2. **[Body Benefits](./benefits/body/OffTheMainThread.md):** Off-main-thread execution, [Multi-Window SharedWorker state](./benefits/body/MultiWindow.md), [Object Permanence](./benefits/body/ObjectPermanence.md), [Four Environments](./benefits/body/FourEnvironments.md) (zero-build ESM development through bundled production), and the [RPC Layer](./benefits/body/RPCLayer.md).
3. **[Engine vs Frameworks](./comparisons/Overview.md):** Architectural comparisons against React, Angular, Vue, Solid, Svelte, and [Sencha Ext JS](./comparisons/NeoVsExtJs.md).
4. **[Testing Guides](./guides/testing/WhiteboxE2E.md):** Deterministic unit and whitebox E2E verification with Playwright and the Neural Link fixture.

### 3. Running or Integrating Coding Agents (Agent Operator Path)
If you are connecting coding agents (Claude Code, Codex, Gemini / Antigravity) to a Neo.mjs app or operating an agent team:
1. **[Brain Interface, Fleet & Agent Tooling](./agentos/FleetManagerArchitecture.md):**
   - **[Fleet Manager Architecture](./agentos/FleetManagerArchitecture.md)** & **[Running the Fleet Cockpit](./agentos/RunningTheFleetCockpit.md):** Orchestrating named peer seats, live activity streams, and multi-window perspectives.
   - **[The Neural Link](./agentos/NeuralLink.md):** Inspecting and driving live Neo.mjs applications over WebSocket + JSON-RPC through the Neural Link's MCP tools.
   - **[Progressive Disclosure Skills](./agentos/ProgressiveDisclosureSkills.md)** & **[Core Skills](./agentos/CoreSkills.md):** `SKILL.md` routers and verification gates.
   - **[The Seat Memory Layer](./agentos/SeatMemoryLayer.md):** Persistent per-seat and shared team memory across sessions.
   - **Retained Architectural Decision Records (`learn/agentos/decisions/`):** Canonical records held in this directory governing compaction taxonomy (`0007`), skill anatomy (`0008`), the identity source-of-truth model (`0018`), and multi-window docking design (`0029`), alongside pointers to the Brain repository's ADRs.

---

## All Ten Sections in `learn/tree.json`

The navigation structure of the learning base is defined in [`learn/tree.json`](./tree.json) across ten root sections:

| # | Section in `learn/tree.json` | Directory / Route | What It Covers |
|---:|---|---|---|
| 1 | **Using These Topics** | [`learn/UsingTheseTopics.md`](./UsingTheseTopics.md) | How the interactive live-preview examples work and where each reader starts |
| 2 | **Benefits** | [`learn/benefits/`](./benefits/Introduction.md) | The Two Hemispheres overview, claims register, and 14 Body capability deep-dives |
| 3 | **Getting Started** | [`learn/gettingstarted/`](./gettingstarted/Workspaces.md) | Workspaces, component blueprints, config reactivity, and debugging |
| 4 | **Brain Interface, Fleet & Agent Tooling** | [`learn/agentos/`](./agentos/FleetManagerArchitecture.md) | Fleet Manager, Cockpit, Neural Link, Skills, Seat Memory, and retained ADRs |
| 5 | **Guides** | [`learn/guides/`](./guides/fundamentals/CodebaseOverview.md) | 8 groups: Fundamentals, Core Engine, UI Building Blocks (dock layouts), Data Handling, User Interaction, Testing, Specific Features, and Advanced |
| 6 | **Tutorials** | [`learn/tutorials/`](./tutorials/DockLayoutsFirstLayout.md) | End-to-end builds (`DockLayoutsFirstLayout`, `TodoList`, `Earthquakes`, `CreatingAFunctionalButton`, `Routing`) |
| 7 | **JavaScript Classes** | [`learn/javascript/`](./javascript/Classes.md) | Modern ES module class inheritance, private fields, and `Neo.setupClass` |
| 8 | **Engine vs Frameworks** | [`learn/comparisons/`](./comparisons/Overview.md) | Architectural comparisons against React, Angular, Vue, Solid, Svelte, and Ext JS |
| 9 | **Glossary** | [`learn/Glossary.md`](./Glossary.md) | Definitions of engine and Agent OS primitives (`OMT`, `VDOM`, `VNode`, `RMA`, `Neural Link`) |
| 10 | **API Docs** | `/docs` (`docs/app/`) | Generated JSDoc class hierarchy and method reference |

*(In addition, [`learn/blog/`](./blog/) holds long-form engineering articles published on the Portal blog.)*

---

## Using `learn/` with a Coding Agent

Coding agents do not need to scrape or paste this directory into their system prompt:
- **Knowledge Base MCP Server (`neo-mjs-knowledge-base`):** Run `ask_knowledge_base` or `query_documents(type: 'guide')` to retrieve semantic chunks indexed from `learn/tree.json`.
- **`/llms.txt` & `/llms-full.txt` on `neomjs.com`:** For external agents without local MCP servers, `https://neomjs.com/llms.txt` serves a structured index of the learning base and API surface, and `/raw/learn/...` serves raw Markdown directly.
- **Live Verification (`neo-mjs-neural-link`):** Pair guide patterns with `inspect_component_render_tree`, `get_instance_properties`, and `patch_code` against the running app.
