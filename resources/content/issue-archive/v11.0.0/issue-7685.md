---
id: 7685
title: data.Store lazy record conversion does not update allItems collection
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-01T09:22:17Z'
updatedAt: '2025-11-01T10:52:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7685'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-01T09:28:17Z'
---
# data.Store lazy record conversion does not update allItems collection

When a `data.Store` is filtered, it creates a secondary `allItems` collection to hold the master, unfiltered dataset. The `get()` and `getAt()` methods in `data.Store` have logic to lazily convert raw data objects into `Record` instances on-demand. Currently, this conversion only mutates the main `_items` array (which contains the filtered data). It fails to propagate this conversion to the `allItems` collection. As a result, if the filter is changed or cleared, the collection is rebuilt from the `allItems` collection, which still contains the old raw data objects. The newly created `Record` instances are lost. This can lead to loss of state and broken reactivity for components that rely on `Record` instances.

## Timeline

- 2025-11-01T09:22:18Z @tobiu added the `bug` label
- 2025-11-01T09:22:18Z @tobiu added the `ai` label
- 2025-11-01T09:28:12Z @tobiu referenced in commit `34021a3` - "data.Store lazy record conversion does not update allItems collection #7685"
- 2025-11-01T09:28:17Z @tobiu closed this issue
- 2025-11-01T10:52:12Z @tobiu assigned to @tobiu

