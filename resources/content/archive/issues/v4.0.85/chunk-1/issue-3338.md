---
id: 3338
title: 'data.RecordFactory: parseRecordValue() => strings'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-08-02T11:59:46Z'
updatedAt: '2022-08-02T12:03:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3338'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-08-02T12:03:37Z'
---
# data.RecordFactory: parseRecordValue() => strings

sometimes APIs do not return all fields. i just encountered a case, where this leads to undefined field values of the type string (not required).

the string parser only checks for null values, so "undefined" ends up as a record field value.

## Timeline

- 2022-08-02T11:59:46Z @tobiu added the `enhancement` label
- 2022-08-02T11:59:46Z @tobiu assigned to @tobiu
- 2022-08-02T12:00:10Z @tobiu referenced in commit `16efbc3` - "data.RecordFactory: parseRecordValue() => strings #3338"
- 2022-08-02T12:03:37Z @tobiu closed this issue

