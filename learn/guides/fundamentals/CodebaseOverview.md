# Codebase Overview: An AI-Native Development Environment

## The Vision: AI-Native, Not AI-Assisted

The core vision of Neo.mjs is to create a truly **AI-native development environment**. We are evolving the framework and its tooling to empower both human developers and AI agents to collaborate seamlessly on building complex, high-performance web applications.

This guide provides a high-level map of the repository, explaining the core philosophies that drive the framework, the architecture that brings them to life, and the folder structure where you'll find the code.

---

## Core Philosophies & Benefits

Neo.mjs is engineered to address the most pressing challenges in modern web development. Understanding these core benefits is key to understanding the "why" behind its architecture.

### 1. A Truly Jank-Free, High-Performance Experience
By default, your entire application runs "Off the Main Thread" (OMT) in a Web Worker. This means intensive business logic, data processing, and UI calculations never block the rendering thread. The result is an exceptionally fluid and responsive user experience, even in complex, data-heavy applications. This multi-threaded approach allows Neo.mjs to apply tens of thousands of DOM updates per second without compromising UI performance.

### 2. A Unified & Declarative Way to Build
Neo.mjs features a powerful and consistent **Unified Config System**. All aspects of your application—from UI components and layouts to data models, controllers, and routing—are defined declaratively through a hierarchical configuration. This eliminates the need to learn disparate syntaxes for different parts of your app, significantly reducing cognitive load and making the entire application more intuitive to build and maintain.

### 3. Desktop-Class, Multi-Window Applications
Break free from the single-tab constraint. Neo.mjs provides native support for applications that span multiple browser windows. A single App Worker can manage the UI across different windows and monitors, all while sharing the same data and state in real-time. Components can even be moved between windows while retaining their JavaScript instances, enabling sophisticated, desktop-class workflows.

### 4. A Revolutionary & Future-Proof Developer Experience
The framework is **100% based on web standards**, using native ES Modules. This enables a **zero-builds development mode** where your code runs directly in the browser without transpilation. This provides instant feedback, simplifies debugging, and future-proofs your application by aligning it with the evolution of the web platform itself.

### 5. A Powerful, Integrated Forms Engine
Building complex forms is dramatically simplified. The forms engine includes its own state provider, supports true nesting of forms (unlike HTML), and can validate forms that aren't even mounted in the DOM. This provides unparalleled structural flexibility and performance for any data input scenario.

---

## Architectural Pillars

These are the technical foundations that deliver the benefits described above.

-   **Multi-Threaded by Default**: The architecture is built around dedicated workers for your **App**, **VDom**, and **Data**, keeping the Main Thread free and responsive.
-   **The VDOM as a Cross-Thread Protocol**: The Virtual DOM is the essential communication layer between workers. We use structured **JSON Blueprints** as the "native language" of the rendering engine—a format that is highly efficient and ideal for AI-driven UI generation.
-   **Two-Tier Reactivity & Hierarchical State**: A unique reactivity system combines a classic "push" model (with `afterSet` hooks) and a modern "pull" model (with automatic dependency tracking via `Effects`). This powers the `state.Provider`, a core feature for hierarchical, application-wide state management that lives entirely within the App Worker.
-   **RPC Layer**: A robust Remote Procedure Call (RPC) layer abstracts away the complexity of `postMessage`, providing a clean, promise-based API for seamless communication between all threads and even backend services.

---

## Repository Structure

### `/src` - The Framework Core
The heart of the Neo.mjs framework, containing the foundational classes.
-   **`core`**: `Base.mjs` (the origin of all classes) and the core reactivity engine.
-   **`worker`**: The logic for the multi-threaded architecture.
-   **`manager`**: Singletons for managing global concerns like `Focus`.
-   **UI Namespaces (`button`, `form`, `grid`, etc.)**: The rich "batteries included" component library.
-   **`data` & `state`**: The core data management and state provider logic.

### `/apps` - Flagship & Example Applications
Complex, real-world applications that showcase the framework's capabilities.
-   **`portal`**: The source for the [neo.mjs.com](https://neo.mjs.com) website, a multi-window IDE.
-   **`sharedcovid`**: A stunning multi-window data visualization application.

### `/learn` - The Knowledge Base
The primary source for all learning materials, guides, and deep-dive articles. This is your starting point for gaining a deeper understanding of any topic. The content of this folder powers the AI Knowledge Base.

### `/ai` - The AI-Native Tooling
The servers and tools that power the AI-native development experience.
-   **`mcp/server`**: The three **Model Context Protocol (MCP)** servers for the Knowledge Base, Memory Core, and GitHub Workflow.

### `/buildScripts` - CLI Tooling
Node.js-based command-line tools for scaffolding (`createApp`) and creating production builds (`webpack`, `esbuild`).

### `/resources` - Static Assets
-   **`scss`**: The source code for the Neo.mjs themes (dark and light).

### `/test` - Automated Testing
-   **`playwright`**: The test suites for both unit and component-level testing.

### `/ROADMAP.md`
The high-level strategic direction for the framework, with a strong focus on enhancing the AI-native development environment.
