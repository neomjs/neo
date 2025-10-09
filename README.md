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

# Build Ultra-Fast, Desktop-Like Web Apps
🚀 **Break Free from UI Freezes — Experience True Multithreading & Uncompromised Responsiveness.**

💻 ***Neo.mjs isn't just an upgrade — it's a new operating system for the web. Where others optimize at the margins, we reinvented the engine.***

Imagine web applications that never jank, no matter how complex the logic, how many real-time updates they handle, or how
many browser windows they span. Neo.mjs is engineered from the ground up to deliver **desktop-like fluidity and scalability**.
**While it excels for Single Page Apps (SPAs), Neo.mjs is simply the best option for browser-based multi-window applications**,
operating fundamentally different from traditional frameworks.

By leveraging a **pioneering Off-Main-Thread (OMT) architecture**, Neo.mjs ensures your UI remains butter-smooth, even during computationally intensive tasks like complex data processing or advanced graphics rendering. The main thread is kept free for one purpose: **flawless user interactions and seamless DOM updates.**

<p align="center">
  <a href="https://youtu.be/pYfM28Pz6_0"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo33s.png" alt="Neo.mjs Performance Demo 1 (YouTube Video)"></a>
  <a href="https://youtu.be/aEA5333WiWY"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo-movie.png" alt="Neo.mjs Performance Demo 2 (YouTube Video)"></a>
</p>

</br></br>
## 🤝 Community & Support

Have a question or want to connect with the community? We have two channels to help you out.

*   **[💬 Discord (Recommended for Questions & History)](https://discord.gg/6p8paPq):** Our primary community hub. All conversations are permanently archived and searchable, making it the best place to ask questions and find past answers.
*   **[⚡️ Slack (For Real-Time Chat)](https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA):** Perfect for quick, real-time conversations. Please note that the free version's history is temporary (messages are deleted after 90 days).

</br></br>
## 🚀 Why Choose Neo.mjs? Solving the Toughest UI Challenges
Traditional single-threaded frontend frameworks often struggle with performance bottlenecks and UI freezes, especially for
large-scale, data-intensive, or real-time applications. Neo.mjs offers a fundamentally different solution, designed for
**uncompromising performance, enhanced security, and superior developer experience.**

1. **Eliminate UI Freezes with True Multithreading**:
   > *"The browser's main thread should be treated like a neurosurgeon: only perform precise, scheduled operations with zero distractions."*</br></br>
   — Neo.mjs Core Philosophy
    
   Neo.mjs's OMT architecture inherently prevents UI freezes. With v10's optimized rendering pipeline, your UI will remain even *more*
   consistently responsive, even during intense data processing or complex graphics rendering. It achieves an astonishing
   rate of **over 40,000 delta updates per second** in optimized environments. This translates to an engine with vast untapped
   potential, limited only by user interaction, not the framework.
 
2. **Unmatched Developer Experience: Transpilation-Free ESM**:
   Say goodbye to complex build steps for development. Neo.mjs apps run **natively as ES Modules directly in the browser**.
   This means **zero builds or transpilations** in dev mode, offering instant reloads and an **unmatched debugging experience**.
   You modify code, and your app updates in real-time.
 
3. **Inherent Security by Design**:
   By prioritizing direct DOM API manipulation over string-based methods (like `innerHTML`), Neo.mjs fundamentally reduces
   the attack surface for vulnerabilities like Cross-Site Scripting (XSS), building a more robust and secure application from the ground up.
 
4. **Declarative, Consistent, & Reusable Architecture**:
   Neo.mjs's unique **unified class config system** allows you to define components, layouts, and logic in a clean, declarative,
   and highly consistent way. This significantly reduces boilerplate, improves maintainability, and makes complex UI composition surprisingly straightforward.

5. **Scalability for Enterprise & Beyond**:
   Whether building sophisticated enterprise dashboards, data-intensive Gen AI interfaces, or desktop-like multi-window applications,
   Neo.mjs's modular, worker-driven architecture effortlessly scales. Components are persistent, stateful instances that can be unmounted,
   moved, and even remounted across browser windows without losing their logic or state. This is key to preventing the "re-rendering madness"
   common in other frameworks.

</br></br>
## 🚀 A New Era of Frontend Architecture

The v10 release marks a significant evolution of the Neo.mjs core, introducing a new functional component model and a revolutionary two-tier reactivity system. We've rebuilt the engine to provide an even more powerful and intuitive developer experience, making it simpler than ever to build complex, performant applications.

To understand the depth of these changes and the philosophy behind them, we've published a five-part blog series that dives deep into the architecture of v10:

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
## 📦 Batteries Included: A Comprehensive Component Library

While other frameworks provide just the view layer, Neo.mjs delivers a complete, natively integrated ecosystem. You'll find a rich
suite of high-performance UI components — from advanced data grids, forms, and trees, to versatile containers and specialized elements
like a full calendar, carousels, and chart wrappers. All components are pre-built and optimized to work seamlessly within the
multi-threaded architecture, significantly accelerating development and eliminating the complexity of integrating disparate
external component libraries.
</br></br>
## 📊  Real-World Win: Crushing UI Lag in Action

Imagine a developer building a stock trading app with live feeds updating every millisecond. Traditional frameworks often choke,
freezing the UI under the data flood. With Neo.mjs, the heavy lifting happens in worker threads, keeping the main thread free.
Traders get real-time updates with zero lag, and the app feels like a native desktop tool. Now, imagine extending this with
**multiple synchronized browser windows**, each displaying different real-time views, all remaining butter-smooth.
That’s Neo.mjs in action — solving problems others can’t touch.
</br></br>
## 🌟 Key Features (and How They Supercharge Your App)

* **Persistent Component Instances**: Components maintain their state and logic even when their DOM is removed or moved.
  No more wasteful re-creations – just surgical, efficient updates.

* **Functional Components & A Modern Hook System**: Embrace a modern, hook-based development style with `defineComponent`, `useConfig`, and `useEvent`. This new paradigm, built on top of our robust class system, offers a familiar and intuitive way to build components while benefiting from the unparalleled performance of our multi-threaded architecture. Best of all, it's free from the "memoization tax" (`useMemo`, `useCallback`) that plagues other frameworks.

* **Reactive State Management**: Leveraging `Neo.state.Provider`, Neo.mjs offers natively integrated, hierarchical state management.
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

* **Clean Architecture (MVVM-inspired)**: View controllers ensure a clear separation of concerns, isolating business logic
  from UI components for easier maintenance, testing, and team collaboration.

* **Multi-Window & Single-Page Applications (SPAs)***: Beyond traditional SPAs, Neo.mjs excels at complex multi-window applications.
  Its unique architecture, powered by seamless cross-worker communication (enabled by `Neo.worker.mixin.RemoteMethodAccess`) and
  extensible Main Thread addons (`Neo.main.addon.*`), enables truly native-like, persistent experiences across browser windows,
  all without a native shell. This is made possible by the same efficient delta-based DOM update engine, which can surgically
  move and update components across window boundaries with unparalleled performance.

* **No npm Dependency Hell**: Neo.mjs apps run with **zero runtime dependencies**, just a few dev dependencies for tooling.
  This means smaller bundles, fewer conflicts, and a simpler dependency graph.

* **Cutting-Edge Use Cases**: Ideal for **data-intensive applications, real-time dashboards, web-based IDEs, banking
  applications, and complex multi-window Gen AI interfaces** where performance and responsiveness are non-negotiable.

* **Unparalleled Debugging Experience**: Benefit from Neo.mjs's built-in debugging capabilities. Easily inspect the full component
  tree across workers, live-modify component configurations directly in the browser console, and observe real-time UI updates,
  all without complex tooling setup.

* **Asymmetric VDOM & JSON Blueprints**: Instead of a complex, class-based VNode tree, your application logic deals with simple, serializable JSON objects. These blueprints are sent to a dedicated VDOM worker for high-performance diffing, ensuring your main thread is never blocked by rendering calculations. This architecture is not only faster but also inherently more secure and easier for AI tools to generate and manipulate.

* **Async-Aware Component Lifecycle**: With the `initAsync()` lifecycle method, components can handle asynchronous setup (like fetching data or lazy-loading modules) *before* they are considered "ready." This eliminates entire classes of race conditions and UI flicker, allowing you to build complex, data-dependent components with confidence.

* **AI-Native through Context Engineering**: We are pioneering **Context Engineering** to build the first framework architected to be developed *with* AI agents. Instead of just prompting, we are building a dynamic system to provide our AI partner with the right knowledge and tools at the right time. This includes a rich, queryable knowledge base and clear guidelines for both the [AI](./.github/AGENTS.md) and the [human developer](./.github/WORKING_WITH_AGENTS.md). This architectural discipline not only enables AI partnership but also results in a cleaner, more predictable, and more maintainable codebase. Get started with the **[AI Knowledge Base Quick Start Guide](./.github/AI_QUICK_START.md)**.

<p align="center">
  <img src="./resources/images/workers-focus.svg" alt="Neo.mjs Worker Architecture Diagram - Shows Main Thread, App Worker, VDom Worker, Canvas Worker, Data Worker, Service Worker, Backend connections.">
</p>

*Diagram: A high-level overview of Neo.mjs's multi-threaded architecture (Main Thread, App Worker, VDom Worker, Canvas Worker, Data Worker, Service Worker, Backend). Optional workers fade in on hover on neomjs.com.*

</br></br>
## 🔍 Architectural Deep Dive: Neo.mjs vs. Main-Thread Frameworks
The true power of Neo.mjs lies in its foundational architectural choices, which solve problems that other frameworks can only mitigate. Here’s a more detailed breakdown:

| Feature | Neo.mjs Approach | Typical Main-Thread Framework Approach (React, Vue, Angular) | The Neo.mjs Advantage |
| :--- | :--- | :--- | :--- |
| **Core Architecture** | **Multi-Threaded by Design**: App logic, VDOM diffing, and rendering are split across a dedicated App Worker, VDOM Worker, and the Main Thread. | **Single-Threaded**: All application logic, state management, rendering, and user interactions compete for the same Main Thread resources. | **Guaranteed UI Responsiveness**. By isolating expensive computations, Neo.mjs ensures the main thread is always free to respond to user input, eliminating UI jank and freezes at an architectural level. |
| **Reactivity Model** | **Direct & Granular Hybrid**: A powerful two-tier system combines imperative "push" (`afterSet`) and declarative "pull" (`Effect`) reactivity. | **React**: Inverted model (the entire component function re-runs). **Vue/Angular**: Highly optimized, direct "pull" model. | **Performant by Default**. Eliminates the "memoization tax" (`useMemo`, etc.) required in React. More powerful than pure pull systems for orchestrating complex business logic. |
| **Component Lifecycle** | **Stable & Persistent**: Instances are created once and persist through UI changes. Features a rich lifecycle with `construct`, `initAsync`, and `afterSetMounted`. | **React**: Ephemeral (functional components are re-executed on every render). **Vue/Angular**: More stable, but lack pre-ready async hooks for complex setup. | **Robust & Predictable**. `initAsync` solves async setup (data fetching, module loading) *before* the first render, preventing UI flicker. Persistence enables complex stateful apps and multi-window operations. |
| **State Management** | **Surgical Subscriptions**: The integrated `StateProvider` allows components to subscribe *only* to the precise state slices they need, completely bypassing intermediate components. | **React**: Context API re-renders all consumers by default, requiring manual optimization. **Vue/Angular**: Optimized state managers (Pinia, NgRx) are still bound by the main thread. | **Scalable & Decoupled**. More performant for global state changes by default. Architecturally cleaner, avoiding props drilling and the performance traps of React's Context. |
| **DOM Updates** | **Asymmetric & Off-Thread**: Simple, serializable JSON objects (blueprints) are sent to the VDOM worker for diffing. The Main Thread only receives and applies minimal, pre-calculated patches. | VDOM diffing and DOM manipulation are computationally expensive tasks that occur on the main thread, directly competing with user interactions. | **Faster, More Secure, and AI-Friendly**. Off-thread diffing is faster. Using direct DOM APIs instead of `innerHTML` is more secure. Simple JSON blueprints are trivial for AI to generate and manipulate. |
| **Dev Experience** | **Zero-Builds Development**: Native ES Modules run directly in the browser. No transpilation or bundling is needed for development. | **Build-Heavy**: Relies on tools like Vite, Webpack, or the Angular CLI, which add complexity, require source maps, and introduce delays. | **Unparalleled Simplicity & Debugging Clarity**. What you write is what you debug. Instant feedback and the absence of complex build toolchains lead to a faster, more intuitive workflow. |

**The Bottom Line**: Where other frameworks optimize operations on the main thread, Neo.mjs moves them off the main thread entirely. This fundamental difference results in a framework that is not just faster, but architecturally more scalable, robust, and resilient to complexity.

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

    // Handled in the App Worker, main thread remains free
    onClick(data) {
        console.log('Clicked!', data);
    }
}

export default Neo.setupClass(MyComponent);
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
