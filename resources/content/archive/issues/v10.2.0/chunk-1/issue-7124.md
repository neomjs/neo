---
id: 7124
title: 'Feature Request: Refine StateProvider Change Notification Logic'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-29T14:15:52Z'
updatedAt: '2025-07-29T14:17:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7124'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-29T14:17:03Z'
---
# Feature Request: Refine StateProvider Change Notification Logic

### Problem Description

In the `Neo.state.Provider`, the `onDataPropertyChange()` hook was being invoked even when a data property's value had not semantically changed. This led to unnecessary processing and potential feedback loops within applications using the state provider, particularly in scenarios involving two-way data binding and URL hash synchronization.

### Solution Implemented

The `#setConfigValue()` method within `src/state/Provider.mjs` has been refined to conditionally call `onDataPropertyChange()`.

1.  **For existing data properties:** The method now leverages the boolean return value of `currentConfig.set(newValue)`. The `Neo.core.Config.set()` method, which internally uses `Neo.isEqual()`, accurately determines if a value has truly changed.
2.  **For newly created data properties:** `onDataPropertyChange()` is always triggered, as these represent a new addition to the state.

### Rationale

This change ensures that `onDataPropertyChange()` is only executed when there is a genuine, semantic change in the data property's value. This aligns the `StateProvider`'s behavior with the consistency model established by `Neo.createConfig().set()`, where the `Config` instance itself is responsible for determining if a value has changed. 

The `EffectManager.pause()` mechanism already provides atomicity for reactive effects during bulk updates, meaning additional batching for `onDataPropertyChange()` calls is not required, as these notifications will not trigger effects until the `EffectManager` is resumed.

This refinement improves the efficiency and robustness of the `StateProvider` by preventing redundant change notifications and contributing to a more predictable state management system.

## Timeline

- 2025-07-29T14:15:52Z @tobiu assigned to @tobiu
- 2025-07-29T14:15:53Z @tobiu added the `enhancement` label
- 2025-07-29T14:16:54Z @tobiu referenced in commit `8f9eec1` - "Feature Request: Refine StateProvider Change Notification Logic #7124"
- 2025-07-29T14:17:03Z @tobiu closed this issue

