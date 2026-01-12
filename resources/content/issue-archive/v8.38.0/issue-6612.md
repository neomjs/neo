---
id: 6612
title: 'data.RecordFactory: calculated record fields no longer get their value'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-04-04T07:56:25Z'
updatedAt: '2025-04-04T10:33:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6612'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-04T10:33:17Z'
---
# data.RecordFactory: calculated record fields no longer get their value

* Deprecation issue when moving the fields generation outside the ctor.
* `data.Model` should generate a map to store calculated fields
* record changes should not only include used fields, but calculated fields as well (this can get optimised later)

## Timeline

- 2025-04-04T07:56:25Z @tobiu added the `bug` label
- 2025-04-04T08:50:18Z @tobiu referenced in commit `097f3f9` - "data.RecordFactory: calculated record fields no longer get their value #6612"
- 2025-04-04T09:36:47Z @tobiu referenced in commit `c8f5499` - "#6612 updating calculated fields, when other fields change at run-time"
- 2025-04-04T10:33:17Z @tobiu closed this issue

