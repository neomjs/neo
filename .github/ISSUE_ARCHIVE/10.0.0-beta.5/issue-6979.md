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
closedAt: '2025-07-07T23:40:22Z'
---
# Enhance StateProvider Test Coverage

**Reported by:** @tobiu on 2025-07-07

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

## Comments

### @tobiu - 2025-07-07 23:40

<img width="934" height="649" alt="Image" src="https://github.com/user-attachments/assets/de06085b-c296-4704-aa91-844a486116f6" />

