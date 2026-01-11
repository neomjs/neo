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
blockedBy: []
blocking: []
closedAt: '2025-07-12T18:13:09Z'
---
# Feature: Fine-grained Reactivity Control with EffectManager.pause()

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

## Timeline

- 2025-07-12T18:10:14Z @tobiu assigned to @tobiu
- 2025-07-12T18:10:15Z @tobiu added the `enhancement` label
- 2025-07-12T18:12:21Z @tobiu referenced in commit `eaf22d8` - "Feature: Fine-grained Reactivity Control with EffectManager.pause() #7026"
- 2025-07-12T18:13:09Z @tobiu closed this issue
- 2025-07-12T18:29:43Z @tobiu added parent issue #6992

