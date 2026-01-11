---
id: 6932
title: Enhance StateProvider for Direct Record Property Binding
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - no auto close
  - hacktoberfest
assignees: []
createdAt: '2025-07-01T19:53:13Z'
updatedAt: '2025-10-22T22:49:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6932'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance StateProvider for Direct Record Property Binding

**Is your feature request related to a problem? Please describe.**
Currently, when a `Neo.state.Provider` holds a `Neo.data.Record` instance in its `data` config, changes to individual properties within that record (e.g., `record.set('firstName', 'NewName')`) do not automatically trigger updates through the `StateProvider`'s binding system. Developers must manually proxy these changes by listening to record-level events (if they existed) and updating a separate `data` property in the `StateProvider`. This creates boilerplate and hinders seamless reactive binding to nested record properties.

**Describe the solution you'd like**
Enhance `Neo.state.Provider` to automatically detect `Neo.data.Record` instances within its `data` config and subscribe to their granular change notifications (assuming `Neo.data.Record` is enhanced to provide such notifications, as per a separate feature request). When a record's property changes, the `StateProvider` should propagate this change through its binding system, allowing components to directly bind to nested record properties using a syntax like `bind: { text: 'data.currentUser.firstName' }`.

This would involve:
1.  Detecting `Neo.data.Record` instances when they are assigned to `StateProvider`'s `data` properties.
2.  Subscribing to the record's granular change events (e.g., `fieldChange` or similar, once implemented in `Neo.data.Record`).
3.  Translating these record-level changes into `StateProvider`-level `onDataPropertyChange` notifications for the specific nested path (e.g., `data.myRecord.fieldName`).

**Describe alternatives you've considered**
The current alternative is to manually listen for changes on the record (if a mechanism existed) and then explicitly call `stateProvider.setData()` for the relevant property. This is verbose and defeats the purpose of a streamlined binding system.

**Additional context**
This feature is dependent on the implementation of granular change notifications within `Neo.data.Record`. It would significantly improve the developer experience for data-intensive applications, making it much easier to build reactive UIs that respond directly to changes in individual record fields.

## Timeline

- 2025-07-01T19:53:14Z @tobiu added the `enhancement` label
### @github-actions - 2025-09-30T02:38:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-09-30T02:38:17Z @github-actions added the `stale` label
- 2025-10-08T09:40:38Z @tobiu removed the `stale` label
- 2025-10-08T09:40:38Z @tobiu added the `help wanted` label
- 2025-10-08T09:40:38Z @tobiu added the `good first issue` label
- 2025-10-08T09:40:38Z @tobiu added the `no auto close` label
- 2025-10-08T09:40:38Z @tobiu added the `hacktoberfest` label

