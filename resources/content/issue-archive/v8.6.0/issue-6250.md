---
id: 6250
title: 'data.RecordFactory: createField() => re-add support for nested fields'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-16T20:52:04Z'
updatedAt: '2025-01-18T20:20:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6250'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-18T20:20:17Z'
---
# data.RecordFactory: createField() => re-add support for nested fields

* With moving the field generation outside of the record ctor into the class creation, we need a new concept for supporting nested field access & change events
* The easiest way is most likely a flat symbol on the record root level

## Timeline

- 2025-01-16T20:52:04Z @tobiu added the `enhancement` label
- 2025-01-16T20:52:04Z @tobiu assigned to @tobiu
### @tobiu - 2025-01-18T20:19:02Z

old version:

![Image](https://github.com/user-attachments/assets/71859dc3-99e8-4677-a193-657f2f6cbcd3)

- 2025-01-18T20:19:50Z @tobiu referenced in commit `71f64b5` - "data.RecordFactory: createField() => re-add support for nested fields #6250"
### @tobiu - 2025-01-18T20:20:17Z

new version:

![Image](https://github.com/user-attachments/assets/3ba1a99d-765c-427f-8775-970ddd197ebc)

- 2025-01-18T20:20:17Z @tobiu closed this issue

