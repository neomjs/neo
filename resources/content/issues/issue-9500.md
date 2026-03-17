---
id: 9500
title: 'Epic: The Core Engine Learning Guides & Workshop'
state: OPEN
labels:
  - documentation
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-03-17T08:49:30Z'
updatedAt: '2026-03-17T09:19:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9500'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

