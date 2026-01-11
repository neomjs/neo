---
id: 6280
title: Neo.assignToNs()
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-24T00:19:38Z'
updatedAt: '2025-01-24T14:18:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6280'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-24T14:18:21Z'
---
# Neo.assignToNs()

this method would be nice to have.

i am using code like this in multiple spots:
```
let nsArray = fieldName.split('.');

fieldName = nsArray.pop();
scope     = Neo.ns(nsArray, true, data);

scope[fieldName] = value
```

the method should work like:
```
Neo.assignToNs('annotations.selected', false, record)
```

params: key, value, scope

## Timeline

- 2025-01-24T00:19:38Z @tobiu added the `enhancement` label
- 2025-01-24T00:19:38Z @tobiu assigned to @tobiu
- 2025-01-24T14:02:34Z @tobiu referenced in commit `34d2cc7` - "Neo.assignToNs() #6280"
- 2025-01-24T14:18:22Z @tobiu closed this issue

