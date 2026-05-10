---
id: 9500
title: 'Epic: The Core Engine Learning Guides & Workshop'
state: CLOSED
labels:
  - documentation
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-03-17T08:49:30Z'
updatedAt: '2026-03-17T11:06:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9500'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-17T11:06:42Z'
---
# Epic: The Core Engine Learning Guides & Workshop

This epic tracks the creation of a new set of learning guides focused on the "Neo Core Engine". These guides will form the basis of a 30-minute workshop but will also live permanently in the Portal App's learning section.

The goal is to explain *why* the Neo class system exists by contrasting it with vanilla JavaScript class limitations, and then deep-dive into its mechanics.

### Motivation
Vanilla JS classes lack declarative configuration, automated reactivity, and a unified lifecycle. The Neo core addresses these missing pieces. Most developers are unaware of how powerful this environment-agnostic engine is (it powers not just the UI, but our Node.js AI infrastructure as well).

### Content Structure & Sub-Tasks

We will add a new section to `learn/tree.json` called "The Core Engine" under `guides`.

*   [ ] **1. Why Enhance JS Classes? (`construct` vs `constructor`)**
    *   Explain the `constructor` trap in native JS (class fields initialized *after* `super()`).
    *   Show how `Neo.create()` and `construct()` solve this, ensuring the instance is fully formed before configuration.
*   [ ] **2. Class Compilation (`Neo.setupClass`)**
    *   Explain how `setupClass` walks the prototype chain, merges `static config`, and applies `Neo.overwrites`.
    *   Include a Mermaid diagram illustrating the prototype chain merging.
*   [ ] **3. The Config System & Circular Dependencies (`core.Config`)**
    *   Explain the reactive config system (the `trailing_underscore_` convention).
    *   Deep dive into `src/core/Base.mjs` and `src/core/Config.mjs`: How the `configSymbol` acts as a temporary holding zone during batch updates (`this.set({...})`) to solve circular dependencies and make all new values available to hooks simultaneously.
*   [ ] **4. Two-Tier Reactivity (Effects vs Hooks)**
    *   Contrast push-based config hooks (`afterSet`) with pull-based dependency tracking (`src/core/Effect.mjs` & `src/core/EffectManager.mjs`).
*   [ ] **5. Instance Lifecycle & `initAsync`**
    *   Explain the need for asynchronous initialization (dynamic imports, remote method registration) and how `initAsync` controls the `isReady` flag.
*   [ ] **6. Core Utilities**
    *   **Compare:** The verification engine (`src/core/Compare.mjs`).
    *   **Delayable:** Declarative method modifiers (`buffer`, `debounce`, `throttle`) in `Base.mjs`.
    *   **Events:** A brief reference to `core.Observable` (linking to the existing guide).

### Implementation Plan
1. Update `learn/tree.json`.
2. Create the markdown files in `learn/guides/core_engine/`.
3. Include live-preview or readonly code blocks to demonstrate the concepts.

## Timeline

- 2026-03-17T08:51:54Z @tobiu added the `epic` label
- 2026-03-17T08:51:54Z @tobiu added the `documentation` label
- 2026-03-17T08:51:54Z @tobiu added the `ai` label
- 2026-03-17T09:13:44Z @tobiu assigned to @tobiu
- 2026-03-17T09:18:56Z @tobiu referenced in commit `c569cd9` - "docs: Add The Core Engine learning guides (#9500)

- Add new section to learn/tree.json
- Add WhyEnhance, SetupClass, ConfigSystem, Reactivity, Lifecycle, Utilities guides"
### @tobiu - 2026-03-17T09:19:06Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the creation of the core engine guides.
> 
> *   Updated `learn/tree.json` with the new "The Core Engine" section (using the `coreengine` folder naming convention as instructed).
> *   Created all 6 markdown files detailing the architecture:
>     *   `WhyEnhance.md` (`construct` vs `constructor`)
>     *   `SetupClass.md` (Class Compilation & prototype merging)
>     *   `ConfigSystem.md` (Reactive configs & `configSymbol`)
>     *   `Reactivity.md` (Push-based hooks vs Pull-based effects)
>     *   `Lifecycle.md` (`initAsync` & remote methods)
>     *   `Utilities.md` (`core.Compare`, `delayable`, `core.Observable`)
> 
> The changes have been committed and pushed to `dev`.

- 2026-03-17T09:36:51Z @tobiu referenced in commit `b826a7f` - "docs: Polish Core Engine guides (mixins, config dependencies) (#9500)

- Fix updateDom typo in ConfigSystem.md
- Expand circular dependency section with live-preview example
- Add detailed Mermaid diagram to Mixin Resolution section"
- 2026-03-17T09:44:22Z @tobiu referenced in commit `a74d91c` - "docs: Fix SetupClass Mermaid diagram errors and add crucial reactive config rule (#9500)"
- 2026-03-17T09:54:31Z @tobiu referenced in commit `e234743` - "docs: Enhance Core Engine guides with narrative storytelling (#9500)"
- 2026-03-17T09:59:20Z @tobiu referenced in commit `342e1ce` - "docs: Rewrite Reactivity guide to emphasize Effect-based cross-instance observation (#9500)"
- 2026-03-17T10:01:39Z @tobiu referenced in commit `b9da6c6` - "docs: Rewrite StateProviders guide to explain Effects and Hierarchical Proxy (#9500)"
### @tobiu - 2026-03-17T11:06:23Z

**Input from Gemini 3.1 Pro:**

> ✦ I have finalized the Core Engine Learning Guides.
> 
> The guides have been significantly rewritten to form a cohesive narrative arc titled "The Journey of a Neo Class", moving away from isolated API documentation toward a structured, storytelling approach.
> 
> The guides now follow this logical progression:
> 1.  **WhyEnhance.md:** The problem with the vanilla JS `constructor` and the introduction of `construct()`.
> 2.  **SetupClass.md:** How the meta-compiler builds the class blueprint and reactive API.
> 3.  **ConfigSystem.md:** Tier 1 Reactivity (Push) and how the `configSymbol` acts as a temporary holding zone to solve circular dependencies during batch updates.
> 4.  **Reactivity.md:** Tier 2 Reactivity (Pull) and how `Effects` power cross-instance observation (Functional Components and State Providers).
> 5.  **Lifecycle.md:** The asynchronous `initAsync` phase required for the distributed architecture.
> 6.  **Utilities.md:** The low-level utilities (`core.Compare`, `delayable`) that protect the engine's performance.
> 
> Additionally, I updated the existing `StateProviders.md` guide to explicitly connect it to the new `Reactivity.md` concepts, detailing the roles of `Neo.core.Effect` and the `HierarchicalDataProxy`.
> 
> All changes have been committed and pushed to the `dev` branch.

- 2026-03-17T11:06:43Z @tobiu closed this issue
- 2026-03-17T11:35:17Z @tobiu referenced in commit `c6e087e` - "docs: Add Config Descriptors and infinite loop safety net to ConfigSystem guide (#9500)"
- 2026-03-17T11:39:52Z @tobiu referenced in commit `5d0deee` - "docs: Add mergeFrom explanation to SetupClass guide (#9500)"

