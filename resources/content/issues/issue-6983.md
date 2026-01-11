---
id: 6983
title: StateProvider Store SourceId Reference
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2025-07-07T23:41:33Z'
updatedAt: '2025-10-08T09:42:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6983'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# StateProvider Store SourceId Reference

Allow stores defined within Neo.state.Provider to reference other stores in the same provider via sourceId.

**Description**
Currently, `Neo.collection.Base` (which `Neo.data.Store` extends) supports a `sourceId` config, allowing a collection to derive its data from another collection. However, this `sourceId` expects a real instance ID of an already existing store.

When defining multiple stores within a `Neo.state.Provider`'s `stores` configuration, these stores are instantiated by the framework. This makes it challenging to set up `sourceId` relationships between them directly within the config, as their instance IDs are not known at definition time.

**Proposed Solution**
Enhance the `Neo.state.Provider`'s `beforeSetStores` logic to support `sourceId` references between stores defined within the *same* `stores` config. This involves two main parts:

1.  **Implicit ID Generation:** If a store defined within the `stores` config does not explicitly provide an `id` config, generate an implicit ID for it. A suitable pattern would be `${provider.id}__${storeKeyName}` (e.g., `myProviderId__myUsersStore`).
2.  **SourceId Resolution:** When processing a store's config, if it contains a `sourceId` property that matches the *key name* of another store defined within the same `stores` config, resolve that `sourceId` to the implicitly (or explicitly) generated instance ID of the referenced store.

**Example Syntax:**
```javascript
stores: {
    myUsers: {
        module: Neo.data.Store,
        model : 'MyApp.model.User',
        data  : [{id: 1, name: 'John'}, {id: 2, name: 'Doe'}]
    },
    myFilteredUsers: {
        module  : Neo.data.Store,
        sourceId: 'myUsers', // References the 'myUsers' store defined above
        filters : [{
            property: 'name',
            value   : 'John'
        }]
    }
}
```

**Benefits**
*   **Simplified Dependent Store Setup:** Allows for defining complex data relationships and derived stores directly within the state management layer's configuration.
*   **Improved Readability:** Makes the dependencies between stores explicit and easy to understand within the `StateProvider` config.
*   **Enhanced Reactivity:** Ensures that changes in source stores automatically propagate to dependent stores, maintaining reactivity.
*   **Reduced Boilerplate:** Eliminates the need for manual instantiation and ID management for dependent stores.

**Acceptance Criteria**
*   Stores defined within `StateProvider.stores` without an explicit `id` config are automatically assigned an ID following the pattern `${provider.id}__${storeKeyName}`.
*   A store defined with a `sourceId` matching the key of another store within the same `StateProvider.stores` config successfully links to the correct source store instance.
*   Changes in the source store correctly trigger updates in the dependent store.
*   Existing `StateProvider` and `Store` functionality remains intact (no regressions).
*   Comprehensive unit tests are added to cover various `sourceId` scenarios, including referencing implicitly and explicitly ID'd stores, and handling non-existent references gracefully.

## Timeline

- 2025-07-07T23:41:34Z @tobiu added the `enhancement` label
### @github-actions - 2025-10-06T02:42:11Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-06T02:42:12Z @github-actions added the `stale` label
- 2025-10-08T09:42:25Z @tobiu removed the `stale` label
- 2025-10-08T09:42:25Z @tobiu added the `help wanted` label
- 2025-10-08T09:42:25Z @tobiu added the `good first issue` label
- 2025-10-08T09:42:25Z @tobiu added the `no auto close` label
- 2025-10-08T09:42:25Z @tobiu added the `hacktoberfest` label

