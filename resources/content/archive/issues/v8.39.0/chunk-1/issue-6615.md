---
id: 6615
title: 'data.RecordFactory: isModifiedField() => enhance the "existing field" check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-04-04T17:06:45Z'
updatedAt: '2025-04-04T17:07:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6615'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-04T17:07:13Z'
---
# data.RecordFactory: isModifiedField() => enhance the "existing field" check

We should better differentiate:
* a field might be present inside the model definition, but missing inside the real data of the record
* for non-leaf fields, they are not included inside the fields map, but can be present inside the data tree

## Timeline

- 2025-04-04T17:06:45Z @tobiu added the `enhancement` label
- 2025-04-04T17:06:45Z @tobiu assigned to @tobiu
- 2025-04-04T17:07:02Z @tobiu referenced in commit `367cd41` - "data.RecordFactory: isModifiedField() => enhance the "existing field" check #6615"
- 2025-04-04T17:07:13Z @tobiu closed this issue

