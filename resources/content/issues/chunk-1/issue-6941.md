---
id: 6941
title: Implement Class-Aware Merging for Nested Configs via Dynamic `Neo.mergeConfig` Replacement
state: OPEN
labels:
  - enhancement
  - no auto close
  - needs-re-triage
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2025-07-04T17:43:25Z'
updatedAt: '2026-06-23T05:13:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6941'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Implement Class-Aware Merging for Nested Configs via Dynamic `Neo.mergeConfig` Replacement

**Is your feature request related to a problem? Please describe.**
The current `Neo.mergeConfig` method treats all objects as generic JavaScript objects, lacking the ability to perform intelligent, class-aware merging for nested configurations that represent instantiable Neo.mjs classes (i.e., objects containing `className`, `module`, or `ntype` properties). This limitation means that when a subclass provides a configuration for a nested component that extends a component defined in a superclass, the merging process may not correctly respect the inheritance hierarchy, leading to suboptimal or unexpected results (e.g., a simple replacement instead of a deep, inheritance-aware merge).

**Describe the solution you'd like**
The proposed solution involves implementing a more advanced `mergeConfig` logic within a dedicated manager (e.g., `Neo.manager.ClassHierarchy` or a new `Neo.manager.Config`). This advanced implementation will leverage `Neo.manager.ClassHierarchy`'s `isA` method to understand the inheritance relationships between classes represented by nested config objects. Once this manager is instantiated and ready (early in the framework's bootstrap process), it will dynamically replace the existing `Neo.mergeConfig` method with its own, more powerful version. This ensures that all subsequent config processing benefits from intelligent, class-aware merging, allowing for proper inheritance-based merging of nested component configurations.

**Describe alternatives you've considered**
Attempting to implement this complex class-aware merging directly within the static `Neo.mergeConfig` method would introduce significant coupling and complexity into the core `Neo` module. Centralizing this logic within a manager that has access to the class hierarchy provides a cleaner, more maintainable, and extensible solution.

**Additional context**
This enhancement is a crucial architectural step towards a more robust and intuitive config system, particularly for applications with deep component hierarchies and extensive use of inheritance. It will significantly improve the predictability and correctness of how nested component configurations are merged across the class chain.

## Timeline

- 2025-07-04T17:43:26Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-03T02:37:08Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-03T02:37:09Z @github-actions added the `stale` label
- 2025-10-03T09:11:50Z @tobiu removed the `stale` label
- 2025-10-03T09:11:50Z @tobiu added the `no auto close` label
- 2025-12-31T14:24:16Z @tobiu cross-referenced by #8230
- 2026-06-23T05:13:06Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T05:13:07Z @neo-gpt added the `needs-design` label
- 2026-06-23T05:13:07Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T05:13:24Z

[ARCH_ALIGNMENT]

Fresh V-B-A triage: #6941 is not code-ready as written.

Evidence:
- `Neo.mergeConfig()` is already strategy-driven: `shallow`, `deep`, `deepArrays`, or a custom function, otherwise replacement (`src/Neo.mjs` lines 650-674).
- `Neo.applyClassConfig()` already applies descriptor merge strategies while walking the static config hierarchy (`src/Neo.mjs` lines 949-959).
- `Neo.core.Base#mergeConfig()` already applies descriptor merge strategies when instance config is merged over static config (`src/core/Base.mjs` lines 737-764).
- `Neo.core.Base#parseItemConfigs()` already supports recursive structural injection via `[mergeFrom]`, deep-merging a parent config block into nested `items` definitions (`src/core/Base.mjs` lines 847-889; symbol defined in `src/core/ConfigSymbols.mjs` lines 1-3).
- `Neo.state.Provider` already declares `data_` with descriptor `merge: 'deep'` (`src/state/Provider.mjs` lines 61-65), which is the native pattern used by the later hierarchical config work.
- The guide `learn/guides/fundamentals/DeclarativeConfigMerging.md` documents the intended structural-injection path: `mergeFrom`, `merge: 'deep'`, recursive nested item support, and `clone: 'deep'` for safety (lines 31-38, 91-132, 151-170).
- Focused verification passed: `npm run test-unit -- test/playwright/unit/core/ConfigMerging.spec.mjs` -> 4 passed.

Stage retrospective:
- Premise is not proven yet. The ticket says nested class-like configs may merge incorrectly, but it does not name a reproducible failing hierarchy where the existing descriptor / `mergeFrom` / Provider primitives fail.
- Prescription fails for now. Dynamically replacing global `Neo.mergeConfig` after manager bootstrap is high-blast and introduces time-dependent behavior into the class setup path. That needs a concrete failing case and an ADR-level design argument before it can be treated as implementation-ready.
- Substrate likely remains the existing descriptor-driven config system unless a benchmark or failing unit test proves the current primitives cannot express the case.

Routing:
- Applied `not-code-ready`, `needs-design`, and `needs-re-triage`.
- Kept `enhancement` and `no auto close`; the underlying problem may still be real, but the current prescription is too broad.

Revalidation trigger: return this to code-ready only after the issue includes a minimal failing test or source-backed example showing a nested `module` / `className` / `ntype` hierarchy where descriptor `merge: 'deep'`, `deepArrays`, `mergeFrom`, or Provider inheritance cannot preserve the intended class relationship. If the failure is real, the next design should compare a local merge strategy / descriptor extension against any global replacement.

Triaged per `ticket-triage` skill. Stage retrospective did not pass as written; labels now reflect design-gated status.


