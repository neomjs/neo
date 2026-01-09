<p align="center">
  <img height="100"src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/logo/neo_logo_text_primary.svg" alt="Neo.mjs Logo">
</p>
</br>
<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg?label=Downloads" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg?logo=npm" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg?label=License" alt="License"></a>
  <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-Neo.mjs-brightgreen.svg?logo=slack" alt="Join the Slack channel"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=Discord&logo=discord&logoColor=white" alt="Discord Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg?logo=GitHub&logoColor=white" alt="PRs Welcome"></a>
</p>

# The Application Engine for the AI Era
🚀 **True Multithreading Meets Context Engineering — Build Desktop-Class UIs with an AI Co-Developer.**

> **⚡ The Mental Model:**
> **Neo.mjs is a multi-threaded application runtime where UI components are persistent objects—not ephemeral render results.**
> This architectural shift enables desktop-class performance, multi-window orchestration, and AI-driven runtime mutation that traditional frameworks cannot achieve.

</br></br>
💻 ***Neo.mjs is not a framework; it is an Application Engine for the web. Just as Unreal Engine provides a complete runtime and toolchain for games, Neo.mjs provides a multi-threaded runtime and AI-native toolchain for enterprise applications.***

Imagine web applications that never jank, no matter how complex the logic, how many real-time updates they handle, or how many browser windows they span. Neo.mjs is engineered from the ground up to deliver **desktop-like fluidity and scalability**. **While it excels for Single Page Apps (SPAs), Neo.mjs is simply the best option for browser-based multi-window applications**, operating fundamentally different from traditional frameworks.

By leveraging a **pioneering Off-Main-Thread (OMT) architecture**, Neo.mjs ensures your UI remains butter-smooth. The main thread is kept free for one purpose: **flawless user interactions and seamless DOM updates.**

But performance is only half the story. With v11, Neo.mjs becomes the world's first **AI-native** frontend platform, designed to be developed *with* AI agents as first-class partners in your workflow.

<p align="center">
  <a href="https://youtu.be/pYfM28Pz6_0"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo33s.png" alt="Neo.mjs Performance Demo 1 (YouTube Video)"></a>
  <a href="https://youtu.be/aEA5333WiWY"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo-movie.png" alt="Neo.mjs Performance Demo 2 (YouTube Video)"></a>
</p>

</br></br>
## 🎯 Is Neo.mjs Right for You?

**Neo.mjs is an Application Engine, not a website builder.**
*It is a mature, enterprise-grade platform with over 130,000 lines of production-ready code.*

✅ **Perfect For:**
* **Financial & Trading Platforms:** processing 10k+ ticks/sec without UI freeze.
* **Multi-Window Workspaces:** IDEs, Control Rooms, and Dashboards that span multiple screens.
* **AI-Native Interfaces:** Apps where the UI structure must be mutable by AI agents at runtime.
* **Enterprise SPAs:** Complex logic that demands the stability of a desktop application.

❌ **Not Designed For:**
* Static content sites or simple blogs (Use Astro/Next.js).
* Teams looking for "React with a different syntax."
* Developers unwilling to embrace the Actor Model (Workers).

</br></br>
## 🚀 The AI-Native Development Platform

Neo.mjs v11 introduces a revolutionary approach to software development: **Context Engineering**. We've moved beyond simple "AI-assisted" coding to create a truly **AI-native** platform where AI agents are deeply integrated partners in the development process. This is made possible by a suite of dedicated **Model Context Protocol (MCP) servers** that give agents the context they need to understand, build, and reason about your code.

This isn't just about generating code; it's about creating a self-aware development environment that accelerates velocity, improves quality, and enables a new level of human-AI collaboration.

<p align="center">
  <img width="800px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/website/blog/ContextEngineering.png" alt="Context Engineering Done Right" class="blog-image">
</p>

1.  **🧠 The Knowledge Base Server**: Gives agents a deep, semantic understanding of your project. Powered by ChromaDB and Gemini embeddings, it allows agents to perform semantic searches across your entire codebase, documentation, and historical tickets. An agent can ask, "How does VDOM diffing work?" and get the exact source files and architectural guides relevant to the *currently checked-out version*.
    * **[📘 Read the Guide](https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/KnowledgeBase.md)**

2.  **💾 The Memory Core Server**: Provides agents with persistent, long-term memory. Every interaction—prompt, thought process, and response is stored, allowing the agent to learn from experience, recall past decisions, and maintain context across multiple sessions. This transforms the agent from a stateless tool into a true collaborator that grows with your project.
    * **[📘 Read the Guide](https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/MemoryCore.md)**

3.  **🤖 The GitHub Workflow Server**: Closes the loop by enabling agents to participate directly in your project's lifecycle. It provides tools for autonomous PR reviews, issue management, and bi-directional synchronization of GitHub issues into a local, queryable set of markdown files. This removes the human bottleneck in code review and project management.
    * **[📘 Read the Guide](https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/GitHubWorkflow.md)**

4.  **⚡️ The Agent Runtime**: Empower your agents to act as autonomous developers. Instead of passively asking for information, agents can write and execute complex scripts using the **Neo.mjs AI SDK**. This enables advanced workflows like self-healing code, automated refactoring, and data migration—running locally at machine speed.
    * **[📘 Read the Guide](https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/CodeExecution.md)**

### Why an Engine Architecture Matters for AI
AI agents are "blind" in traditional compiled frameworks (React, Svelte) because the code they write (JSX/Templates) is destroyed by the build step—the runtime reality (DOM nodes) looks nothing like the source.

**In Neo.mjs, the map IS the territory.** Because components are persistent objects in the App Worker (not ephemeral DOM nodes), the AI can query their state, methods, and inheritance chain at any time. It's like inspecting a running game character in Unreal Engine, rather than parsing the pixels on the screen. The AI sees exactly what the engine sees, enabling it to reason about state, inheritance, and topology with perfect accuracy. Furthermore, the **Neural Link** allows agents to query the runtime for the **Ground Truth**, enabling them to verify reality and solve complex, runtime-dependent problems that static analysis cannot touch.

This powerful tooling, co-created with AI agents, enabled us to ship **388 architectural enhancements in just 6 weeks**. This order-of-magnitude increase in velocity proves that Context Engineering solves the complexity bottleneck. To learn more about this paradigm shift, read our blog post: **[388 Tickets in 6 Weeks: Context Engineering Done Right](./learn/blog/context-engineering-done-right.md)**.

</br></br>
## 🔗 The Neural Link: Your App is a Living Graph

**Most frameworks offer a "Read-Only" view of your code to AI. Neo.mjs offers "Read/Write" access to the Runtime.**

Because Neo.mjs components are persistent objects (Lego Technic) rather than transient DOM nodes (Melted Plastic), the **Neural Link** allows AI agents to connect directly to the engine's memory.

* **Introspection:** Agents can query the Scene Graph (`get_component_tree`) to understand the exact state of the UI.
* **Mutation:** Agents can hot-patch class methods, modify state, or re-parent components in real-time without a reload.
* **Verification:** Agents can simulate user events (clicks, drags) to verify their own fixes.

**[📘 Read the Neural Link Guide](https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/NeuralLink.md)**

</br></br>
## 🚀 Jump In: Your First Neo.mjs App in Minutes

Run this command:

```bash
npx neo-app@latest
```

This one-liner sets up everything you need to start building with Neo.mjs, including:

* A new app workspace.
* A pre-configured app shell.
* A local development server.
* Launching your app in a new browser window — all in one go.

:book: More details? Check out our [Getting Started Guide](./.github/GETTING_STARTED.md)

:student: Make sure to dive into the [Learning Section](https://neomjs.com/dist/production/apps/portal/#/learn/gettingstarted.Setup)

Next steps:

* :star: **Experience stunning Demos & Examples here**: [Neo.mjs Examples Portal](https://neomjs.com/dist/production/apps/portal/#/examples)
* Many more are included inside the repos [apps](https://github.com/neomjs/neo/tree/dev/apps)
  & [examples](https://github.com/neomjs/neo/tree/dev/examples) folders.
* :blue_book: All Blog Posts are listed here: [Neo.mjs Blog](https://neomjs.com/dist/production/apps/portal/#/blog)
* :robot: Get started with the **[AI Knowledge Base Quick Start Guide](./.github/AI_QUICK_START.md)**.

</br></br>
## 📦 The Object Model: The Scene Graph

**Frameworks compile away. Engines stay alive.**

In traditional frameworks, the source code is a blueprint that gets destroyed to create the DOM. In Neo.mjs, the source code instantiates a **Scene Graph**—a hierarchy of persistent objects that lives in the App Worker.

* **Lego Technic vs. Duplo:** Most framework components are like "melted plastic"—once rendered, they lose their identity. Neo.mjs components are like **Lego Technic**: precision-engineered parts that retain their state, methods, and relationships at runtime.
* **The JSON Protocol:** Because every component adheres to a strict **serialization protocol** (toJSON), the entire application behaves as a mutable graph.
* **Runtime Permutation:** This allows AI agents (or you) to inspect, dismantle, and reconfigure the application on the fly—changing layouts, moving dashboards between windows, or hot-swapping themes without a reload.

It's not just a view library; it's a **construction kit** for adaptive, living applications.

</br></br>
## 💡 Why Choose Neo.mjs?

**You're building F1 apps with Toyota parts.**

Traditional frameworks are reliable general-purpose tools (Toyota), sacrificing raw performance for mass adoption. Neo.mjs is precision-engineered for extreme performance (F1), designed for applications where "good enough" isn't acceptable.

1.  **Eliminate UI Freezes with True Multithreading**:
    > *"The browser's main thread should be treated like a neurosurgeon: only perform precise, scheduled operations with zero distractions."*</br></br>
    — Neo.mjs Core Philosophy

    Neo.mjs's OMT architecture inherently prevents UI freezes. With our optimized rendering pipeline, your UI will remain consistently responsive, even during intense data processing. It achieves an astonishing rate of **over 40,000 delta updates per second** in optimized environments, potential, limited only by user interaction, not the platform.

2.  **Unprecedented Velocity with an AI-Native Workflow**:
    The integrated MCP servers provide a "context-rich" environment where AI agents can work alongside human developers. This enables autonomous code reviews, deep codebase analysis, and a shared understanding of project history, dramatically accelerating development and solving the "bus factor" problem for complex projects.

3.  **Build Desktop-Class, Multi-Window Applications**:
    Neo.mjs is the premier solution for building complex, multi-window web applications like **trading platforms, browser-based IDEs, Outlook-style email clients, and multi-screen LLM interfaces**. Its shared worker architecture allows a single application instance to run across multiple browser windows, with real-time state synchronization and the ability to move components between windows seamlessly.

4.  **Unmatched Developer Experience: Transpilation-Free ESM**:
    Say goodbye to complex build steps. Neo.mjs apps run **natively as ES Modules directly in the browser**. This means **zero builds or transpilation** in dev mode, offering instant reloads and an unparalleled debugging experience where what you write is what you debug.

5.  **Inherent Security by Design**:
    By prioritizing direct DOM API manipulation over string-based methods (like `innerHTML`), Neo.mjs fundamentally reduces the attack surface for vulnerabilities like Cross-Site Scripting (XSS), building a more robust and secure application from the ground up.

</br></br>
## 📊  Real-World Win: Crushing UI Lag in Action

Imagine a developer building a stock trading app with live feeds updating every millisecond. Traditional frameworks often choke,
freezing the UI under the data flood. With Neo.mjs, the heavy lifting happens in worker threads, keeping the main thread free.
Traders get real-time updates with zero lag, and the app feels like a native desktop tool. Now, imagine extending this with
**multiple synchronized browser windows**, each displaying different real-time views, all remaining butter-smooth.
That’s Neo.mjs in action — solving problems others can’t touch.

</br></br>
## 🌟 Engine Subsystems (and How They Supercharge Your App)

* **The Threading Subsystem**: A dedicated orchestrator that isolates application logic (App Worker) from rendering logic (Main Thread) and data processing (Data Worker). This ensures the main thread is always free to respond to user input, eliminating UI jank at an architectural level.

* **The Rendering Pipeline**: Just as a game engine sends draw calls to the GPU, the Neo.mjs App Worker sends compressed JSON deltas to the Main Thread. This **Asymmetric VDOM** approach is faster, more secure, and AI-friendly than main-thread diffing.

* **The Scene Graph (Object Permanence)**: Functioning as a persistent Application Engine, Neo.mjs components are **live entities** in the App Worker, functioning like nodes in a Scene Graph. They retain their state and identity even when detached from the DOM. This enables **Runtime Permutation**: the ability to drag active dashboards between windows or re-parent complex tools at runtime without losing context.

* **The Component System**: Neo.mjs offers two powerful component models. **Functional Components**, introduced more recently, provide an easier onboarding experience and a modern, hook-based development style (`defineComponent`, `useConfig`, `useEvent`), similar to other popular frameworks. They are ideal for simpler, more declarative UIs. For advanced use cases requiring granular control over VDOM changes and deeper integration with the engine's lifecycle, **Class-Based Components** offer superior power and flexibility, albeit with slightly more code overhead. Both models seamlessly interoperate, allowing you to choose the right tool for each part of your application while benefiting from the unparalleled performance of our multi-threaded architecture. Best of all, our functional components are free from the "memoization tax" (`useMemo`, `useCallback`) that plagues traditional UI libraries.

* **The State Subsystem**: Leveraging `Neo.state.Provider`, Neo.mjs offers natively integrated, hierarchical state management.
  Components declare their data needs via a concise `bind` config. These `bind` functions act as powerful inline formulas, allowing
  Components to automatically react to changes and combine data from multiple state providers within the component hierarchy.
  This ensures dynamic, efficient updates — from simple property changes to complex computed values — all handled off the main thread.
  ```javascript
  // Example: A component binding its text to state
  static config = {
      bind: {
          // 'data' here represents the combined state from all parent providers
          myComputedText: data => `User: ${data.userName || 'Guest'} | Status: ${data.userStatus || 'Offline'}`
      }
  }
  ```

* **The Logic Subsystem**: View controllers ensure a clear separation of concerns, isolating business logic
  from UI components for easier maintenance, testing, and team collaboration.

* **Multi-Window & Single-Page Applications (SPAs)***: Beyond traditional SPAs, Neo.mjs excels at complex multi-window applications.
  Its unique architecture, powered by seamless cross-worker communication and extensible Main Thread addons, enables truly native-like, persistent experiences across browser windows.

* **The Module System**: Neo.mjs apps run with **zero runtime dependencies**, just a few dev dependencies for tooling.
  This means smaller bundles, fewer conflicts, and a simpler dependency graph.

* **Unparalleled Debugging Experience**: Benefit from Neo.mjs's built-in debugging capabilities. Easily inspect the full component
  tree across workers, live-modify component configurations directly in the browser console, and observe real-time UI updates,
  all without complex tooling setup.

* **Asymmetric VDOM & JSON Blueprints**: Instead of a complex, class-based VNode tree, your application logic deals with simple, serializable JSON objects. These blueprints are sent to a dedicated VDOM worker for high-performance diffing, ensuring your main thread is never blocked by rendering calculations. This architecture is not only faster but also inherently more secure and easier for AI tools to generate and manipulate.

* **Async-Aware Component Lifecycle**: With the `initAsync()` lifecycle method, components can handle asynchronous setup (like fetching data or lazy-loading modules) *before* they are considered "ready." This eliminates entire classes of race conditions and UI flicker, allowing you to build complex, data-dependent components with confidence.

<p align="center">
  <img src="./resources/images/workers-focus.svg" alt="Neo.mjs Worker Architecture Diagram - Shows Main Thread, App Worker, VDom Worker, Canvas Worker, Data Worker, Service Worker, Backend connections.">
</p>

*Diagram: A high-level overview of Neo.mjs's multi-threaded architecture (Main Thread, App Worker, VDom Worker, Canvas Worker, Data Worker, Service Worker, Backend). Optional workers fade in on hover on neomjs.com.*

</br></br>
## 🔍 Engine Architecture: The Runtime & The Toolchain

Just as a Game Engine consists of a **Runtime** (what players play) and an **Editor** (what developers use), Neo.mjs is split into two complementary layers.

### 1. The Runtime (Neo.mjs Core)
*Runs in the Browser. Production-Ready. Zero-Bloat.*

This is the high-performance engine that powers your application. It operates on a **multi-threaded architecture**, isolating the main thread to ensure 60fps fluidity even under heavy load.
*   **App Worker:** Runs your entire application logic, state, and virtual DOM diffing.
*   **Multi-Window Orchestration:** A single engine instance can power multiple browser windows via SharedWorkers. Components can be dragged, dropped, and moved between windows seamlessly—essential for complex "Control Room" interfaces.
*   **Main Thread:** Treated as a "dumb" renderer, only applying efficient DOM patches.
*   **Object Permanence:** Components are persistent entities that can be moved, detached, and re-attached without losing state.

### 2. The Toolchain (Agent OS)
*Runs in Node.js. Dev-Time Only. AI-Native.*

This is the "Editor" for the AI era. It connects your development environment to the running engine, allowing AI agents to act as first-class collaborators.
*   **The Neural Link:** A bi-directional bridge allowing agents to "see" and "mutate" the live runtime graph.
*   **MCP Servers:** Provide agents with deep context (Knowledge Base) and memory (Memory Core).
*   **Context Engineering:** A structured workflow where agents help you build the engine by understanding its architecture.

**The Result:** You don't just write code; you cultivate a living system with an AI partner that understands exactly how the engine works.

</br></br>
## A Platform at Scale: More Than Just a Library

To appreciate the scope of Neo.mjs, it's important to understand its scale. This is not a micro-library; it's a comprehensive, enterprise-ready platform representing over a decade of architectural investment. **Neo.mjs is an innovation factory.**

The stats below, from **January 2026**, provide a snapshot of the ecosystem. For a deeper dive, you can explore the full **[Codebase Overview](./learn/guides/fundamentals/CodebaseOverview.md)**.

-   **~45,000 lines** of core platform source code
-   **~36,000 lines** across hundreds of working examples and flagship applications
-   **~12,000 lines** of production-grade theming
-   **~14,000 lines** of dedicated AI-native infrastructure
-   **~53,000 lines** of detailed JSDoc documentation

**Total: Over 170,000 lines of curated code and documentation.**

This is not a small library—it's a complete ecosystem with more source code than many established frameworks, designed for the most demanding use cases.

</br></br>
## 📚 Foundational Architecture: The Core Principles

The v10 release marked a significant evolution of the Neo.mjs core, introducing a new functional component model and a revolutionary two-tier reactivity system. These principles form the bedrock of the framework today. We've published a five-part blog series that dives deep into this architecture:

1.  **[A Frontend Love Story: Why the Strategies of Today Won't Build the Apps of Tomorrow](./learn/blog/v10-post1-love-story.md)**
    *   *An introduction to the core problems in modern frontend development and the architectural vision of Neo.mjs.*
2.  **[Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity](./learn/blog/v10-deep-dive-reactivity.md)**
    *   *Explore the powerful two-tier reactivity system that makes the "memoization tax" a thing of the past.*
3.  **[Beyond Hooks: A New Breed of Functional Components for a Multi-Threaded World](./learn/blog/v10-deep-dive-functional-components.md)**
    *   *Discover how functional components in a multi-threaded world eliminate the trade-offs of traditional hooks.*
4.  **[Deep Dive: The VDOM Revolution - JSON Blueprints & Asymmetric Rendering](./learn/blog/v10-deep-dive-vdom-revolution.md)**
    *   *Learn how our off-thread VDOM engine uses simple JSON blueprints for maximum performance and security.*
5.  **[Deep Dive: The State Provider Revolution](./learn/blog/v10-deep-dive-state-provider.md)**
    *   *A look into the powerful, hierarchical state management system that scales effortlessly.*

</br></br>
## ⚙️ Declarative Class Configuration: Build Faster, Maintain Easier

Neo.mjs’s class config system allows you to define and manage classes in a declarative and reusable way. This simplifies
class creation, reduces boilerplate code, and improves maintainability.

```javascript
import Component from '../../src/component/Base.mjs';

/**
 * Lives within the App Worker
 * @class MyComponent
 * @extends Neo.component.Base
 */
class MyComponent extends Component {
    static config = {
        className   : 'MyComponent',
        myConfig_   : 'defaultValue', // Reactive property
        domListeners: {               // Direct DOM event binding
            click: 'onClick'
        }
    }

    // Triggered automatically by the config setter when myConfig changes
    afterSetMyConfig(value, oldValue) {
       console.log('myConfig changed:', value, oldValue);
    }

    // Executed in the App Worker. The Main Thread (UI) never sees this logic.
    onClick(data) {
        console.log('Clicked!', data);
    }
}

export default Neo.setupClass(MyComponent);

// -------------------------------------------------------
// The Engine allows Runtime Mutation:
// An AI agent (or you) can inspect and modify this instance LIVE without a reload.
// -------------------------------------------------------

// Agent Command (via Neural Link):
Neo.get('my-component-id').set({
    myConfig: 'newValue',
    style   : { color: 'red' } // Instant update via OMT Rendering Pipeline. No build step. No reload.
});
```

For each config property ending with an underscore (_), Neo.mjs automatically generates a getter and a setter on the class prototype. These setters ensure that changes trigger corresponding lifecycle hooks, providing a powerful, built-in reactive system:

* `beforeGetMyConfig(value)`</br>
  (Optional) Called before the config value is returned via its getter, allowing for last-minute transformations.
* `beforeSetMyConfig(value, oldValue)`</br>
  (Optional) Called before the config value is set, allowing you to intercept, validate, or modify the new value. Returning undefined will cancel the update.
* `afterSetMyConfig(value, oldValue)`</br>
  (Optional) Called after the config value has been successfully set and a change has been detected, allowing for side effects or reactions to the new value.

For more details, check out the [Class Config System documentation](https://neomjs.com/dist/production/apps/portal/index.html#/learn/gettingstarted.Config).

</br></br>
## 🤝 Community & Support

Have a question or want to connect with the community? We have two channels to help you out.

*   **[💬 Discord (Recommended for Questions & History)](https://discord.gg/6p8paPq):** Our primary community hub. All conversations are permanently archived and searchable, making it the best place to ask questions and find past answers.
*   **[⚡️ Slack (For Real-Time Chat)](https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA):** Perfect for quick, real-time conversations. Please note that the free version's history is temporary (messages are deleted after 90 days).

</br></br>
## 🧭 Vision & Roadmap

To understand the long-term goals and future direction of the project, please see our strategic documents:

*   **[✨ The Vision](./.github/VISION.md):** Learn about the core philosophy and the "why" behind our architecture.
*   **[🗺️ The Roadmap](./ROADMAP.md):** See what we're working on now and what's planned for the future.

</br></br>
## :handshake: How to Contribute

:hammer_and_wrench: Want to contribute? Check out our [Contributing Guide](https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md).

</br></br>
Copyright (c) 2015 - today, [Tobias Uhlig](https://www.linkedin.com/in/tobiasuhlig/)
