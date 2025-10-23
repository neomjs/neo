---
id: 6933
title: Enhance Neo.data.Record for Granular Change Notification
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-07-01T19:54:03Z'
updatedAt: '2025-10-22T22:56:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6933'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-01T20:32:45Z'
---
# Enhance Neo.data.Record for Granular Change Notification

**Reported by:** @tobiu on 2025-07-01

**Is your feature request related to a problem? Please describe.**
`Neo.data.Record` instances, while holding data, do not currently provide a direct, granular mechanism for external entities to subscribe to changes of their individual fields. Changes are primarily propagated via the owning `Neo.data.Store`'s `mutate` event, which is a broader, collection-level notification. This makes it challenging for components or state providers to react specifically to changes within a record's properties without manual workarounds.

**Describe the solution you'd like**
Introduce a lightweight, internal mechanism within `Neo.data.Record` to signal when its individual fields change. This could be a new internal event (e.g., `fieldChange`) or a dedicated callback that gets triggered by methods like `set()` or `setRecordFields()` when a field's value is modified. The goal is to provide a granular, record-level notification of changes, while maintaining the record's lightweight nature.

**Describe alternatives you've considered**
Currently, developers must rely on listening to the `mutate` event on the `Neo.data.Store` and then manually inspecting the `addedItems` and `removedItems` to infer changes, or implement custom logic to track record field changes. This is inefficient and adds significant boilerplate, especially when only a specific field's change is relevant.

**Additional context**
This enhancement is a prerequisite for enabling more seamless and idiomatic binding to individual record properties via `Neo.state.Provider` (as described in a separate feature request). It is crucial to implement this in a way that does not significantly increase the memory footprint or processing overhead for each `Neo.data.Record` instance, as records are often used in large quantities within collections.

## Comments

### @tobiu - 2025-07-01 20:32

**Clarification on Solution / Current Implementation Status:**

The new `notifyChange()` method within the `Record` class (created by `RecordFactory`) provides the necessary internal hook for granular field change notifications. This method, when called (e.g., by `record.set()`), executes `instance.setRecordFields()` and crucially **returns the `param` object** containing details about the change (`{fields, model, record, silent}`).

External entities, such as `Neo.state.Provider`, can leverage this by using `Neo.util.Function.createSequence()` to attach a function to the `Record` instance's `notifyChange` method. This attached function would execute *after* the record's fields have been updated and would receive the `param` object, providing direct access to the `record` and the `changedFields` array.

This approach allows for granular record-level change detection without requiring the `Neo.data.Record` class to implement a full `Observable` mixin, thus preserving its lightweight nature. The foundation for granular change notification at the record level appears to be in place through the `notifyChange()` method's design and its interaction with `createSequence()`.

