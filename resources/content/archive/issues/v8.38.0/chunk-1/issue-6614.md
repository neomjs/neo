---
id: 6614
title: 'data.RecordFactory: add support for calculated fields inside the original data symbol'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-04-04T12:54:01Z'
updatedAt: '2025-04-04T12:54:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6614'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-04T12:54:25Z'
---
# data.RecordFactory: add support for calculated fields inside the original data symbol

* `parseRecordValue()` should get changed to just use one param
* the signature of `calculate()` for a given field needs to change: `calculate(data, fields)`, where data is either `record[dataSymbol]` or `record[originalDataSymbol]` 

## Timeline

- 2025-04-04T12:54:01Z @tobiu added the `enhancement` label
- 2025-04-04T12:54:18Z @tobiu referenced in commit `6c78dc7` - "data.RecordFactory: add support for calculated fields inside the original data symbol #6614"
- 2025-04-04T12:54:25Z @tobiu closed this issue

