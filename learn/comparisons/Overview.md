# Overview

## Engine vs Framework Comparisons

This section provides detailed comparisons between Neo.mjs and popular JavaScript frameworks. Our goal is to help
you understand why Neo.mjs is classified as an **Application Engine** and how its multi-threaded, worker-based
architecture differs fundamentally from the single-threaded design of traditional libraries and frameworks.

We aim to compare these frameworks from a **technical, objective, and constructive perspective**, focusing on how
different architectural choices and design philosophies address common web development challenges. Please note that
these comparison documents were generated with the assistance of a large language model (Gemini).

Each comparison article will focus on:

*   **Bridging Knowledge Gaps:** Mapping concepts you know to Neo.mjs.
*   **Highlighting Differentiators:** What makes Neo.mjs unique.
*   **Side-by-Side Analysis:** Feature-by-feature comparisons.
*   **Trade-offs and Use Cases:** When Neo.mjs might be the optimal choice.

### Architectural Snapshot

The table below offers a high-level architectural comparison of the frameworks discussed in this section. It is designed
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

*   [Neo.mjs vs. React](/learn/comparisons/NeoVsReact.md)
*   [Neo.mjs vs. Angular](/learn/comparisons/NeoVsAngular.md)
*   [Neo.mjs vs. Vue.js](/learn/comparisons/NeoVsVue.md)
*   [Neo.mjs vs. Solid.js](/learn/comparisons/NeoVsSolid.md)
*   [Neo.mjs vs. Next.js](/learn/comparisons/NeoVsNextJs.md)
*   [Neo.mjs vs. Ext.js](/learn/comparisons/NeoVsExtJs.md)

If you have feedback on any of our comparisons or would like to see a new one, please feel free to open an issue on our
[GitHub repository](https://github.com/neomjs/neo/issues).
