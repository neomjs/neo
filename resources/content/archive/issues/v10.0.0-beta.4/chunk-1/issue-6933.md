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
blockedBy: []
blocking: []
closedAt: '2025-07-01T20:32:45Z'
---
# Enhance Neo.data.Record for Granular Change Notification

**Is your feature request related to a problem? Please describe.**
`Neo.data.Record` instances, while holding data, do not currently provide a direct, granular mechanism for external entities to subscribe to changes of their individual fields. Changes are primarily propagated via the owning `Neo.data.Store`'s `mutate` event, which is a broader, collection-level notification. This makes it challenging for components or state providers to react specifically to changes within a record's properties without manual workarounds.

**Describe the solution you'd like**
Introduce a lightweight, internal mechanism within `Neo.data.Record` to signal when its individual fields change. This could be a new internal event (e.g., `fieldChange`) or a dedicated callback that gets triggered by methods like `set()` or `setRecordFields()` when a field's value is modified. The goal is to provide a granular, record-level notification of changes, while maintaining the record's lightweight nature.

**Describe alternatives you've considered**
Currently, developers must rely on listening to the `mutate` event on the `Neo.data.Store` and then manually inspecting the `addedItems` and `removedItems` to infer changes, or implement custom logic to track record field changes. This is inefficient and adds significant boilerplate, especially when only a specific field's change is relevant.

**Additional context**
This enhancement is a prerequisite for enabling more seamless and idiomatic binding to individual record properties via `Neo.state.Provider` (as described in a separate feature request). It is crucial to implement this in a way that does not significantly increase the memory footprint or processing overhead for each `Neo.data.Record` instance, as records are often used in large quantities within collections.

## Timeline

- 2025-07-01T19:54:05Z @tobiu added the `enhancement` label
- 2025-07-01T20:08:23Z @tobiu referenced in commit `999b659` - "Enhance Neo.data.Record for Granular Change Notification #6933 => added notifyChange() as the single source of truth for record field changes => applied to the record prototype."
- 2025-07-01T20:20:58Z @tobiu referenced in commit `0e895c3` - "#6933 notifyChange() doc comment enhancement"
- 2025-07-01T20:27:07Z @tobiu referenced in commit `73e3c79` - "#6933 notifyChange() => signature fix"
### @tobiu - 2025-07-01T20:32:45Z

**Clarification on Solution / Current Implementation Status:**

The new `notifyChange()` method within the `Record` class (created by `RecordFactory`) provides the necessary internal hook for granular field change notifications. This method, when called (e.g., by `record.set()`), executes `instance.setRecordFields()` and crucially **returns the `param` object** containing details about the change (`{fields, model, record, silent}`).

External entities, such as `Neo.state.Provider`, can leverage this by using `Neo.util.Function.createSequence()` to attach a function to the `Record` instance's `notifyChange` method. This attached function would execute *after* the record's fields have been updated and would receive the `param` object, providing direct access to the `record` and the `changedFields` array.

This approach allows for granular record-level change detection without requiring the `Neo.data.Record` class to implement a full `Observable` mixin, thus preserving its lightweight nature. The foundation for granular change notification at the record level appears to be in place through the `notifyChange()` method's design and its interaction with `createSequence()`.

- 2025-07-01T20:32:45Z @tobiu closed this issue

