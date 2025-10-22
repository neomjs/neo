---
id: 7026
title: 'Feature: Fine-grained Reactivity Control with EffectManager.pause()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-12T18:10:14Z'
updatedAt: '2025-07-12T18:13:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7026'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-12T18:13:09Z'
---
# Feature: Fine-grained Reactivity Control with EffectManager.pause()

**Reported by:** @tobiu on 2025-07-12

---

**Parent Issue:** #6992 - Functional Components

---

**Is your feature request related to a problem? Please describe.**
The current reactive system in Neo.mjs, while powerful, can sometimes lead to unintended dependencies. Specifically, when code within an `Effect`'s execution path (e.g., within `createVdom` or a hook like `useConfig`) needs to access a reactive property (like `ComponentManager.registry` via `Neo.getComponent()`) without making that property a dependency of the `Effect`, it can lead to unnecessary re-runs or infinite loops.

**Describe the solution you'd like**
Implement a mechanism within `EffectManager` to temporarily pause dependency tracking. This involves:
1.  Modifying `Neo.core.Config.get()` to delegate dependency registration to `EffectManager.addDependency()`.
2.  Adding `isPaused` flag, `addDependency(config)`, `pause()`, and `resume()` methods to `Neo.core.EffectManager`.
3.  Using `EffectManager.pause()` and `EffectManager.resume()` around specific code blocks (e.g., `Neo.getComponent()` in `useConfig()`) to prevent unintended dependency tracking.

**Describe alternatives you've considered**
(None considered, as this is a core architectural improvement.)

**Additional context**
This feature provides fine-grained control over reactivity, preventing unintended dependencies and improving the robustness of functional components and hooks. It ensures that effects only re-run when their truly intended dependencies change.

**Affected Files:**
*   `src/core/Config.mjs`
*   `src/core/EffectManager.mjs`
*   `src/functional/useConfig.mjs`

