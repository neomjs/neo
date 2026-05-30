---
id: 3282
title: 'data.RecordFactory: parseRecordValue() => fix checks for maxLength & minLength'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-07-12T09:20:55Z'
updatedAt: '2022-07-12T09:21:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3282'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-12T09:21:45Z'
---
# data.RecordFactory: parseRecordValue() => fix checks for maxLength & minLength

right now, the checks do not include the `.length`of the strings to parse.

## Timeline

- 2022-07-12T09:20:55Z @tobiu added the `bug` label
- 2022-07-12T09:20:56Z @tobiu assigned to @tobiu
- 2022-07-12T09:21:38Z @tobiu referenced in commit `2eae7d9` - "data.RecordFactory: parseRecordValue() => fix checks for maxLength & minLength #3282"
- 2022-07-12T09:21:45Z @tobiu closed this issue

