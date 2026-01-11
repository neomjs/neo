---
id: 8078
title: 'Enhance Store DX: Add ''init'' parameter to add() and insert() for immediate record creation'
state: CLOSED
labels:
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-12-10T10:59:12Z'
updatedAt: '2025-12-10T11:07:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8078'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-10T11:07:21Z'
---
# Enhance Store DX: Add 'init' parameter to add() and insert() for immediate record creation

Improve DX by allowing `Neo.data.Store` to return fully instantiated records directly from `add()` and `insert()`.

**Proposal:**
Overload `add()` and `insert()` in `Neo.data.Store` with an optional second parameter `init=false`.

1.  **`add(items, init=false)`**
    *   If `init` is `true`, the method should return an **Array of Record instances** instead of the raw data objects.
    *   It effectively combines `add(items)` + `initRecord(item)` for each added item.

2.  **`insert(index, items, init=false)`**
    *   Similarly, allow `insert` to optionally initialize and return the created records.

**Reasoning:**
Currently, `lazy records` requires a two-step process to get a usable Record instance:
```javascript
store.add(data);
const record = store.get(id); // Required to get the Record
```
This change simplifies it to:
```javascript
const [record] = store.add(data, true);
```

**Architectural Note:**
This overloads the `collection.Base` signature. While slightly impure, the DX benefit for Store usage is significant.


## Timeline

- 2025-12-10T10:59:13Z @tobiu added the `enhancement` label
- 2025-12-10T10:59:13Z @tobiu added the `developer-experience` label
- 2025-12-10T10:59:14Z @tobiu added the `ai` label
- 2025-12-10T11:00:28Z @tobiu assigned to @tobiu
- 2025-12-10T11:07:12Z @tobiu referenced in commit `de32ae8` - "Enhance Store DX: Add 'init' parameter to add() and insert() for immediate record creation #8078"
- 2025-12-10T11:07:21Z @tobiu closed this issue

