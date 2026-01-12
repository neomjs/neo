---
id: 6981
title: Implement a Proxy set trap for Neo.state.Provider data to enable direct reactive assignments
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T20:09:05Z'
updatedAt: '2025-07-07T20:11:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6981'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-07T20:11:20Z'
---
# Implement a Proxy set trap for Neo.state.Provider data to enable direct reactive assignments

**Description**
The `Neo.state.Provider` currently requires the use of `setData()` to trigger reactivity when updating data properties. To enhance developer experience and align with more intuitive JavaScript patterns, we should implement a `Proxy` `set` trap on the `stateProvider.data` object. This will allow direct assignments (e.g., `stateProvider.data.myProperty = 'newValue'`) to automatically trigger the underlying `setData()` mechanism, ensuring reactivity.

**Problem**
Developers accustomed to direct property assignments for state management in other reactive frameworks may find the explicit `setData()` calls cumbersome or non-idiomatic. This can lead to confusion and potential bugs if `setData()` is not used, as direct assignments currently do not trigger the `Effect` system.

**Proposed Solution**
Modify `src/state/createHierarchicalDataProxy.mjs` to include a `set` trap within the `Proxy` returned by `createHierarchicalDataProxy`.

The `set` trap should:
1.  Intercept direct assignments to properties on the `stateProvider.data` proxy.
2.  Determine the correct `Neo.state.Provider` instance (current or a parent in the hierarchy) that "owns" the property being assigned. This can be achieved by leveraging the existing `getOwnerOfDataProperty` method.
3.  Call the `setData()` method on the identified owning `StateProvider` with the `fullPath` of the property and the new `value`. This will ensure that the `Neo.core.Config` instances are updated and the `Effect` system is triggered, maintaining full reactivity.

**Benefits**
*   Improved developer ergonomics: Allows for more natural and concise data updates.
*   Reduced boilerplate: Eliminates the need for explicit `setData()` calls in many common scenarios.
*   Enhanced consistency: Aligns the `StateProvider`'s data manipulation with common reactive programming paradigms.

**Acceptance Criteria**
*   Direct assignments to `stateProvider.data.someProperty` (including nested properties like `stateProvider.data.user.firstName`) successfully trigger reactive updates in bound components.
*   The `onDataPropertyChange` method in `Neo.state.Provider` is correctly invoked when data is updated via direct assignment.
*   Existing `setData()` calls continue to function as expected.
*   No regressions are introduced in the `StateProvider`'s reactivity or hierarchical data access.
*   Comprehensive unit tests are added to `test/siesta/tests/state/Provider.mjs` to cover direct assignment scenarios, including nested properties and various data types.

## Timeline

- 2025-07-07T20:09:05Z @tobiu assigned to @tobiu
- 2025-07-07T20:09:07Z @tobiu added the `enhancement` label
- 2025-07-07T20:10:47Z @tobiu referenced in commit `95f89f2` - "Implement a Proxy set trap for Neo.state.Provider data to enable direct reactive assignments #6981"
- 2025-07-07T20:11:20Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `eac5988` - "Implement a Proxy set trap for Neo.state.Provider data to enable direct reactive assignments #6981"

