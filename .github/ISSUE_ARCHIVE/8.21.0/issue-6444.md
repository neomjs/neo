---
id: 6444
title: 'data.Store: createRecord() => enhancement'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-02-11T21:20:47Z'
updatedAt: '2025-02-11T21:21:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6444'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-11T21:21:28Z'
---
# data.Store: createRecord() => enhancement

* move the logic inside `beforeSetData()` here
* => support for object & object[]
* use the new `createRecord()` method inside `add()`
* adjust the `isLoading` state inside beforeSet & afterSetData()

## Activity Log

- 2025-02-11 @tobiu added the `enhancement` label
- 2025-02-11 @tobiu assigned to @tobiu
- 2025-02-11 @tobiu referenced in commit `1322a90` - "data.Store: createRecord() => enhancement #6444"
- 2025-02-11 @tobiu closed this issue

