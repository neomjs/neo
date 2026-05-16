---
id: 3194
title: 'data.RecordFactory: setRecordFields() => verify the field values'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-25T10:05:15Z'
updatedAt: '2022-06-25T10:10:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3194'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-25T10:10:55Z'
---
# data.RecordFactory: setRecordFields() => verify the field values

`setRecordFields()` should use `parseRecordValue()` internally. this becomes more important, once we add more field based validation rules (e.g. maxLength, minLength).

## Timeline

- 2022-06-25T10:05:15Z @tobiu added the `enhancement` label
- 2022-06-25T10:05:15Z @tobiu assigned to @tobiu
- 2022-06-25T10:10:45Z @tobiu referenced in commit `215e0d1` - "data.RecordFactory: setRecordFields() => verify the field values #3194"
- 2022-06-25T10:10:55Z @tobiu closed this issue

