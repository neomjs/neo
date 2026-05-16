---
id: 6979
title: Enhance StateProvider Test Coverage
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T18:01:29Z'
updatedAt: '2025-07-07T23:40:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6979'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-07T23:40:22Z'
---
# Enhance StateProvider Test Coverage

**Description**
The `Neo.state.Provider` has recently undergone a significant refactoring to integrate with the new `Neo.core.Effect` system and `Neo.state.createHierarchicalDataProxy`. While existing tests have been updated and are passing, there is a need to expand test coverage to ensure the robustness and reliability of the `StateProvider` under more complex scenarios.

**Problem**
The current test suite for `Neo.state.Provider` (located at `test/siesta/tests/state/Provider.mjs`) primarily covers basic data manipulation and hierarchical access. It lacks comprehensive tests for advanced features and interactions, such as:
*   Formulas
*   Store management
*   Two-way data binding

Without these tests, there's a risk of regressions or unexpected behavior when new features are added or existing ones are modified.

**Proposed Solution**
Expand the test suite for `Neo.state.Provider` to include the following:

1.  **Formulas Testing:**
    *   Add tests for basic formula calculations.
    *   Verify that formulas react correctly to changes in their dependencies.
    *   Test formulas that depend on other formulas.

2.  **Store Management Testing:**
    *   Add tests for binding components to `Neo.data.Store` instances managed by the `StateProvider`.
    *   Verify that changes within the store (e.g., adding/removing records, updating fields) correctly trigger updates in bound components.

3.  **Two-Way Binding Testing:**
    *   Implement tests for two-way binding between component configs and state provider data properties.
    *   Ensure that changes originating from the component correctly update the state provider, and vice-versa.

**Additional Context**
The recent refactoring of `Neo.state.Provider` to use `Neo.core.Effect` and `Neo.state.createHierarchicalDataProxy` has introduced a powerful new reactivity model. Comprehensive testing is crucial to validate this new architecture and prevent future issues.

## Timeline

- 2025-07-07T18:01:29Z @tobiu assigned to @tobiu
- 2025-07-07T18:01:30Z @tobiu added the `enhancement` label
- 2025-07-07T19:26:28Z @tobiu referenced in commit `4cbe250` - "#6979 Re-Implemented & tested 2-way bindings"
- 2025-07-07T22:20:15Z @tobiu referenced in commit `44afd90` - "#6979 more test cases"
- 2025-07-07T22:51:20Z @tobiu referenced in commit `489ab1a` - "Enhance StateProvider Test Coverage #6979"
- 2025-07-07T22:53:21Z @tobiu referenced in commit `67a3221` - "#6979 Formulas in nested providers should combine own and parent data"
### @tobiu - 2025-07-07T23:40:22Z

<img width="934" height="649" alt="Image" src="https://github.com/user-attachments/assets/de06085b-c296-4704-aa91-844a486116f6" />

- 2025-07-07T23:40:22Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `f1176c0` - "#6979 Re-Implemented & tested 2-way bindings"
- 2025-07-09T00:10:51Z @tobiu referenced in commit `1596d71` - "#6979 more test cases"
- 2025-07-09T00:10:51Z @tobiu referenced in commit `f65ab86` - "Enhance StateProvider Test Coverage #6979"
- 2025-07-09T00:10:51Z @tobiu referenced in commit `19acac5` - "#6979 Formulas in nested providers should combine own and parent data"

