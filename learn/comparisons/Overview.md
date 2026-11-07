# Overview

## Engine vs Framework Comparisons

This section compares Neo.mjs with single-threaded JavaScript libraries and frameworks (`React`, `Angular`, `Vue.js`, `Solid.js`, `Next.js`, and `Ext.js`). Neo.mjs is a complete, batteries-included **Application Engine** (`459` classes across `39` namespaces — `100,000`-row buffered grids, `26` form field types with nested forms, calendars, `42`-class multi-window Dock Layouts, `8` layouts, and `38` main-thread addons) built for **every desktop and mobile web application**, while its Off-Main-Thread worker runtime and live **[Neural Link (`Possession Interface`)](../agentos/NeuralLink.md)** go where single-threaded frameworks cannot.

Each comparison examines:

*   **Bridging Knowledge Gaps:** Mapping concepts you know to Neo.mjs.
*   **Platform & Architectural Differentiators:** Off-Main-Thread execution, persistent component instances, and zero-builds native ES modules.
*   **AI-Era Advantage (JSON-First Since 2019 GA):** Why LLMs natively excel at reading and writing Neo.mjs JSON blueprints ([`JSONFirstUIs.md`](../benefits/body/JSONFirstUIs.md)) and inspecting live running apps via the **[Neural Link](../agentos/NeuralLink.md)** without the pre-AI complexity burden.
*   **Side-by-Side Analysis:** Feature-by-feature architectural comparisons.

### Architectural Snapshot

The table below offers a high-level architectural comparison of Neo.mjs and the single-threaded libraries and frameworks discussed in this section:

| Feature                 | Neo.mjs                                | React                                   | Vue.js                               | Solid.js                                | Angular                                 |
| ----------------------- |----------------------------------------| --------------------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------- |
| **Core Architecture**   | Multi-Threaded (App / VDom / Data / Canvas / SharedWorker) | Single-Threaded (Main-Thread Bound)     | Single-Threaded (Main-Thread Bound)  | Single-Threaded (Main-Thread Bound)     | Single-Threaded (Main-Thread Bound)     |
| **Platform Breadth**    | **459 Classes / 39 Namespaces** (Grids, 26 Form Fields, Calendar, 42 Dock Classes, 38 Addons, Zero Dependencies) | UI Rendering Library Only (Requires 3rd-Party Glue) | View Layer + Router/Pinia (Requires 3rd-Party UI Kits) | UI Rendering Library Only (Requires 3rd-Party Glue) | Framework + CLI (Requires CDK / 3rd-Party Grids & Docking) |
| **VDOM & UI Format**    | **JSON-First Blueprints** in App Worker (Since Nov 2019 GA — Native LLM Fluency) | JSX in Main Thread (Requires Build Step) | SFC Templates / JSX in Main Thread (Requires Build Step) | Compiled JSX in Main Thread (No VDOM)   | HTML Templates in Main Thread (Requires Build Step) |
| **Reactivity Model**    | Fine-Grained Two-Tier (`Config` + `Effect`, Surgical Deltas) | Cascading Re-Renders (Manual Memo)      | Fine-Grained (Compiler-Assisted)     | Fine-Grained (Non-Destructive)          | Zone.js / Signals (Main-Thread Change Detection) |
| **Manual Optimizations**| Not Required                           | Required (`memo`, `useCallback`, `useMemo`) | Not Required                         | Not Required                            | Often Required (`OnPush`)               |
| **State Mutability**    | Directly Mutable (`state.Provider` & Configs) | Immutable (Enforced Boilerplate)        | Mutable (Proxied)                    | Immutable Signal Setters / Stores       | Mutable / Observable-based              |
| **Dev Environment**     | **Zero-Builds Native ES Modules** (Instant) | Build-Based (Vite, Webpack, Next)       | Build-Based (Vite)                   | Build-Based (Vite)                      | Build-Based (Angular CLI)               |
| **Multi-Window Support**| **Native `SharedWorker` + 42-Class Dock Layouts** (Live Cross-Window Tear-Out & Re-Docking) | None Native (Requires Custom IPC & Re-Mount) | None Native (Requires Custom IPC & Re-Mount) | None Native (Requires Custom IPC & Re-Mount) | None Native (Requires Custom IPC & Re-Mount) |
| **AI Runtime Embodiment**| **Live via [Neural Link](../agentos/NeuralLink.md)** (Scene-Graph Introspection & In-Place Hot-Patching) | Blind Outside Static Source / DOM Snapshots | Blind Outside Static Source / DOM Snapshots | Blind Outside Static Source / DOM Snapshots | Blind Outside Static Source / DOM Snapshots |

### Available Comparisons

*   [Neo.mjs vs. React](NeoVsReact.md)
*   [Neo.mjs vs. Angular](NeoVsAngular.md)
*   [Neo.mjs vs. Vue.js](NeoVsVue.md)
*   [Neo.mjs vs. Solid.js](NeoVsSolid.md)
*   [Neo.mjs vs. Next.js](NeoVsNextJs.md)
*   [Neo.mjs vs. Ext.js](NeoVsExtJs.md)

If you have feedback on any of our comparisons or would like to see a new one, please feel free to open an issue on our
[GitHub repository](https://github.com/neomjs/neo/issues).
