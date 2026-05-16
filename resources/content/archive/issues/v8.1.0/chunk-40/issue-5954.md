---
id: 5954
title: 'collection.Base: isItem() has to return true for "object like" items'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-09-21T16:18:46Z'
updatedAt: '2024-09-21T16:24:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5954'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T16:24:36Z'
---
# collection.Base: isItem() has to return true for "object like" items

```
    isItem(value) {
        return Neo.isObject(value) || Neo.isRecord(value)
    }
```

the change happened, when introducing `Neo.isRecord()` and making `Neo.isObject()` super strict to only return true for real objects.

collections however can contain neo instances as items, which no longer get recognised.

if the recognition no longer works, removing items will break, which can result in growing memory leaks when frequently removing items.

## Timeline

- 2024-09-21T16:18:46Z @tobiu added the `bug` label
- 2024-09-21T16:18:46Z @tobiu assigned to @tobiu
- 2024-09-21T16:24:31Z @tobiu referenced in commit `87a6ed8` - "collection.Base: isItem() has to return true for "object like" items #5954"
- 2024-09-21T16:24:36Z @tobiu closed this issue
- 2024-09-21T17:34:38Z @tobiu cross-referenced by #5955

