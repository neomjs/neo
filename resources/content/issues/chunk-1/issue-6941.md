---
id: 6941
title: Implement Class-Aware Merging for Nested Configs via Dynamic `Neo.mergeConfig` Replacement
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2025-07-04T17:43:25Z'
updatedAt: '2025-10-03T09:11:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6941'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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

