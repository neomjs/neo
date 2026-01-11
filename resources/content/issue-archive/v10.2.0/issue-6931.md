---
id: 6931
title: Simplify binding to reactive store properties in StateProvider
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-01T19:52:02Z'
updatedAt: '2025-10-22T22:58:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6931'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-28T11:20:42Z'
---
# Simplify binding to reactive store properties in StateProvider

**Is your feature request related to a problem? Please describe.**
When using `Neo.state.Provider` to manage `Neo.data.Store` instances, binding to reactive properties of these stores (e.g., `store.count_`) requires a cumbersome multi-step process:
1. Defining a separate reactive data property within the `StateProvider`'s `data` config.
2. Adding a `listeners` config to the store definition within `StateProvider.stores` to listen for the relevant change event (e.g., `countChange`).
3. Implementing a handler method within the `StateProvider` to update the `data` property when the store's reactive property changes.
4. Finally, binding components to this newly created `data` property.

This boilerplate makes it less intuitive and more verbose to leverage the reactivity of stores within the `StateProvider` system.

**Describe the solution you'd like**
Enhance `Neo.state.Provider` to automatically expose or allow direct binding to the reactive properties of its managed stores. Ideally, a syntax like `bind: { text: 'stores.mySharedStore.count' }` should directly reflect the `count_` property of the `mySharedStore` instance, without requiring manual proxying through the `StateProvider`'s `data` config and event listeners.

Possible approaches could include:
- Automatic proxying of reactive store properties into the `StateProvider`'s data namespace.
- A more sophisticated binding mechanism within `StateProvider` that can directly resolve and observe reactive properties of nested store instances.

**Describe alternatives you've considered**
The current workaround involves manually proxying the store's reactive properties to the `StateProvider`'s `data` config, as described in the problem statement. While functional, it adds unnecessary complexity and boilerplate, especially for common reactive properties like `count_`.

**Additional context**
This enhancement would significantly improve developer experience and reduce boilerplate when working with reactive stores and `Neo.state.Provider`, making the state management system even more powerful and intuitive.

## Timeline

- 2025-07-01T19:52:03Z @tobiu added the `enhancement` label
### @tobiu - 2025-07-28T11:20:42Z

already resolved:
https://github.com/neomjs/neo/blob/dev/learn/guides/datahandling/StateProviders.md#managing-stores-with-state-providers

- 2025-07-28T11:20:42Z @tobiu closed this issue

