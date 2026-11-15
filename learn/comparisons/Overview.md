# Overview

## Engine vs Framework Comparisons

**Neo.mjs has two hemispheres.** The **Body** is a multi-threaded **Application Engine**: your application lives in an
App Worker, a VDom Worker computes the DOM changes, the main thread only applies them, and one application can span
several browser windows over a SharedWorker. It ships what an application is built from (a buffered grid that scrolls
100,000 rows, form fields, the calendar, timeline, scheduler and Gantt views, dock layouts, main-thread addons),
MIT-licensed and with zero runtime dependencies. The
[Codebase Overview](../guides/fundamentals/CodebaseOverview.md) maps the source tree subsystem by subsystem.
The **Brain** is an Agent OS: AI maintainers from rival labs, with persistent memory and peer review, who build and
maintain the engine in public. The two meet in the **Neural Link**, through which an agent inhabits a running Neo.mjs
application instead of only writing its code. [What Is Neo.mjs?](../benefits/Introduction.md) tells that story.

The comparisons in this section are about the Body. They set the engine beside the libraries and frameworks most teams
build browser applications with today, from a **technical, objective, and constructive perspective**: where the code
runs, how an update reaches the DOM, what a developer has to optimize by hand, and how one application spans several
windows. The comparison of the Brain with agent platforms and memory products is part of
[What Is Neo.mjs?](../benefits/Introduction.md).

Each comparison article will focus on:

*   **Bridging Knowledge Gaps:** Mapping concepts you know to Neo.mjs.
*   **Highlighting Differentiators:** What makes Neo.mjs unique.
*   **Side-by-Side Analysis:** Feature-by-feature comparisons.
*   **Use Cases:** The applications Neo.mjs builds, and what it adds on top.

### Architectural Snapshot

The table below offers a high-level architectural comparison of Neo.mjs and the frameworks discussed in this section. It is designed
to provide a quick snapshot of their core differences. For a deeper understanding, please refer to the detailed comparison
articles.

| Feature                 | Neo.mjs                                | React                                   | Vue.js                               | Solid.js                                | Angular                                 |
| ----------------------- |----------------------------------------| --------------------------------------- | ------------------------------------ | --------------------------------------- | --------------------------------------- |
| **Core Architecture**   | Multi-Threaded (Worker-Based)          | Single-Threaded (Main-Thread Bound)     | Single-Threaded (Main-Thread Bound)  | Single-Threaded (Main-Thread Bound)     | Single-Threaded (Main-Thread Bound)     |
| **VDOM Location**       | App Worker                             | Main Thread                             | Main Thread                          | No VDOM (Direct DOM Updates)            | Main Thread                             |
| **Reactivity Model**    | Fine-Grained (Surgical Atomic Updates) | Cascading Re-Renders (Manual Memo)      | Fine-Grained (Compiler-Assisted)     | Fine-Grained (Non-Destructive)          | Zone.js (Automatic Change Detection)    |
| **Manual Optimizations**| Not Required                           | Required (`memo`, `useCallback`, `useMemo`) | Not Required                         | Not Required                            | Not Required                            |
| **State Mutability**    | Directly Mutable                       | Immutable (Enforced)                    | Mutable (Proxied)                    | Mutable (Proxied)                       | Mutable (Observable-based)              |
| **Dev Environment**     | Zero-Builds (Instant)                  | Build-Based (Vite, etc.)                | Build-Based (Vite)                   | Build-Based (Vite)                      | Build-Based (Angular CLI)               |
| **Multi-Window Support**| Native (Shared Data/Components)        | Limited/Requires Custom Logic           | Limited/Requires Custom Logic        | Limited/Requires Custom Logic           | Limited/Requires Custom Logic           |

### Available Comparisons

*   [Neo.mjs vs. React](NeoVsReact.md)
*   [Neo.mjs vs. Angular](NeoVsAngular.md)
*   [Neo.mjs vs. Vue.js](NeoVsVue.md)
*   [Neo.mjs vs. Solid.js](NeoVsSolid.md)
*   [Neo.mjs vs. Next.js](NeoVsNextJs.md)
*   [Neo.mjs vs. Ext.js](NeoVsExtJs.md)

Two comparisons look at component suites instead of UI libraries: the engine's grid and planning views against the
products people search for by name.

*   [Neo.mjs vs. AG Grid](NeoVsAgGrid.md): a data grid in a web worker, with an open benchmark at 100,000 rows
*   [Neo.mjs vs. Bryntum](NeoVsBryntum.md): the scheduler and the Gantt chart

If you have feedback on any of our comparisons or would like to see a new one, please feel free to open an issue on our
[GitHub repository](https://github.com/neomjs/neo/issues).
