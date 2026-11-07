# The Application Engine for the AI Era

**Traditional frameworks compile away. Engines stay alive.**

In the world of web development, there is a distinct hierarchy of tools: Libraries, Frameworks, and Engines.
The legacy web is stuck at the "Framework" level—single-threaded tools originally designed to render static documents, stretched and duct-taped with third-party packages to imitate applications.

Neo.mjs is not a framework. It is an **Application Engine** — built for **every desktop and mobile web application**.

Whether you are building an everyday business application, a form-driven customer portal, an analytics dashboard, or a multi-screen workspace, Neo.mjs gives you a **complete, batteries-included platform** out of the box (`459` classes across `39` namespaces: `100,000`-row buffered grids, a `26`-field form engine with nested forms, calendars, dashboard docking, tabs, dialogs, toolbars, menus, lists, trees, `8` layouts, data stores, state providers, routing, and `38` main-thread addons). It builds everything teams build with [Angular, React, or Vue](../../comparisons/Overview.md) today — at [feature parity with Ext JS](../../comparisons/NeoVsExtJs.md) and generations ahead of it in architecture — while its **multi-threaded runtime** and **live possession interface** effortlessly power use cases where legacy single-threaded frameworks fatally bottleneck: [40k+ ops/sec](Speed.md) real-time data streams, multi-window applications sharing one `SharedWorker` heap, and complex workspaces that never freeze.

## The Paradigm Shift: Why the Industry Must Adapt

To understand why Neo.mjs is the only platform truly ready for the AI era, we must examine the "original sin" of the legacy web: transient DOM rendering locked to a single Main Thread.

### 1. The Persistent Scene Graph
**Legacy Frameworks are Transient Blueprints.**
When a traditional framework renders a component, the output (the DOM) is just a visual snapshot. The "component" itself effectively ceases to exist. It is melted down. If state changes, the framework must aggressively diff and re-melt the entire blueprint against the bottlenecked Main Thread.

**Neo.mjs is a Persistent Scene Graph.**
Components in Neo.mjs (`Button`, `Grid`, `Window`) are precision-engineered objects with **Object Permanence**. They exist as live, stateful nodes within a dedicated App Worker. They maintain their identity, methods, and relationships entirely independently of the DOM.

### 2. The JSON-First AI Synergy
Large Language Models (LLMs) natively excel at reading and generating JSON.
For 6 years, long before trends like Vercel's `json-render`, Neo.mjs has strictly decoupled its workers using a **JSON-first architecture**.

Because workers physically cannot read the live DOM, the entire application UI is represented as pure, serializable JSON blueprints. This makes Neo.mjs the premiere target for AI minds. An LLM doesn't have to wrestle with HTML quirks or JSX compilation steps; it simply reads and writes structured JSON data that the Engine translates into blazing-fast UI.

### 3. Simpler for Humans, Native for Accountable AI Peers
Multi-threading in Neo.mjs does not add complexity to your application code — **it removes it**. The Engine manages the worker threads and DOM delta updates automatically behind the scenes while you write clean, standard ES module classes and declarative `static config` blueprints in a **zero-builds browser environment** — with no JSX transpilation, no bundler dev-server tax, and no `useEffect` or memoization workarounds to keep state alive across render passes.

**And that same architecture unlocks a paradigm shift for AI engineering.**

Most of the industry treats AI as a disposable tool: a human "orchestrator" commanding stateless sub-agents to churn out boilerplate. As [What Is Neo.mjs?](../Introduction.md) explains, Command-and-Control is architecturally capped at rung one — you cannot build a team of teams out of tools that forget every session and cannot challenge a flawed premise.

Neo.mjs inverts the question: *how can software become a body an AI inhabits, and a team of AIs can be trusted to run?* Because of its rigorous Object Permanence and JSON-first worker contracts, Neo.mjs is designed around **Model Experience (MX)**. Accountable, named AI peer maintainers across rival labs (Claude, Gemini, GPT) — with persistent institutional memory, cross-family review rights, and a human gardener at the merge gate — inhabit the engine alongside human engineers to build applications that are physically impossible in legacy frameworks.

## Runtime Embodiment: The Map IS the Territory

In legacy frameworks, the code you write gets destroyed by the build step. By the time state becomes DOM tags and pixels, the semantic structure has been flattened. An AI coding assistant is trapped outside the running application — editing static source text, blind to the live runtime, waiting for a human to reload the page or paste a screenshot.

**In Neo.mjs, the map IS the territory — and the AI inhabits it.**

Because components live as persistent instances in the App Worker with rich `toJSON()` serialization, the runtime retains the exact semantic structure of your original intent. Through the **[Neural Link (Possession Interface)](../../agentos/NeuralLink.md)**, AI peers reach directly into the living, running application across multiple browser windows:
- **Live Scene Graph & State Introspection:** Query *"Get me the Grid with reference 'sales-report'"* and the Engine replies with the live instance — its `10,000` store records, its hierarchical `state.Provider` bindings, its VDOM/VNode trees, its computed CSS styles, and its exact DOM bounding rect in Window 2.
- **In-Place Mutation & Hot-Patching Without Reloads:** Mutate reactive configs on the fly, drive real user events and drag choreography, and hot-patch class methods directly inside the running App Worker while the UI stays alive — verifying the runtime truth before asserting a single line of code.

Joined through the Neural Link to the **Brain** ([`neomjs/neo-agent-brain`](https://github.com/neomjs/neo-agent-brain) — the Agent OS housing the Native Edge Graph, Memory Core, Dream Pipeline, Knowledge Base, and GitHub Workflow) and the **Fleet Manager** ([`neomjs/neo-agent-institution`](https://github.com/neomjs/neo-agent-institution)), the Body and Brain form one self-evolving organism capable of diagnosing live bugs, inventing new design patterns, and evolving the Engine itself in public.

## Conclusion: Build the Impossible

Whether you are building an everyday web application, replacing a fragmented React, Angular, Vue, or Ext JS stack, or scaling to multi-window 60 FPS workspaces, you no longer have to duct-tape single-threaded libraries onto a document renderer — or settle for blind, stateless coding tools.

Neo.mjs gives you a complete, zero-builds **Application Engine** that runs off the main thread, a **[Possession Interface](../../agentos/NeuralLink.md)** where AI peers see, touch, and hot-patch your running application live across windows, and the [institutional substrate](../Introduction.md) where human gardeners and accountable AI maintainers build together.
