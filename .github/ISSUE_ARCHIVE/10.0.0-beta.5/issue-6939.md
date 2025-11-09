---
id: 6939
title: Pass Config Descriptors to Neo.core.Config Constructors
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-04T17:18:52Z'
updatedAt: '2025-07-04T17:21:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6939'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-04T17:21:45Z'
---
# Pass Config Descriptors to Neo.core.Config Constructors

**Reported by:** @tobiu on 2025-07-04

**Is your feature request related to a problem? Please describe.**
The existing config system had a subtle issue where `Neo.core.Config` instances were not consistently initialized with their specific `isEqual` and `mergeStrategy` properties defined in static config descriptors. This could lead to `Neo.isEqual` being used universally, even when a custom equality check was intended. Furthermore, the initial population of reactive configs could sometimes bypass or redundantly trigger `beforeSet`/`afterSet` hooks, leading to unexpected behavior or inefficient processing.

**Describe the solution you'd like**
The solution implemented ensures that `Neo.core.Config` instances are properly initialized with their corresponding `isEqual` and `mergeStrategy` from the static config descriptors.
1.  `src/core/Config.mjs`: The `constructor` and `initDescriptor` were refined to accept the full descriptor. `initDescriptor` now correctly sets `isEqual` and `mergeStrategy` on the `Config` instance, but critically, it no longer pre-populates the internal `#value` from the descriptor's default value. This ensures that the `beforeSet`/`afterSet` hooks for reactive configs are correctly triggered only on the first actual value assignment.
2.  `src/core/Base.mjs`: The `getConfig` method was updated to pass the relevant `configDescriptor` directly to the `Neo.core.Config` constructor. This guarantees that each `Config` instance is aware of its specific `isEqual` and `mergeStrategy` from the outset.

This approach maintains the separation of concerns: `mergeStrategy` is applied only for initial values in `Base.mjs#mergeConfig`, while `isEqual` and change notifications for subsequent updates are handled by the `Config` instance itself via the generated setters in `Neo.mjs#autoGenerateGetSet`.

**Describe alternatives you've considered**
Initially, I considered having `Neo.core.Config.set()` handle the `mergeStrategy` for all updates, but this was clarified to be incorrect as `mergeStrategy` is strictly for initial value merging during instance creation. Another alternative involved passing the default value from `staticConfig` directly to the `Config` constructor, which would have led to redundant `beforeSet`/`afterSet` calls.

