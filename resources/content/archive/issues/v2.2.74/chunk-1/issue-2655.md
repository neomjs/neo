---
id: 2655
title: 'form.field.Select: Add the ability to pass a record id (keyProperty) as the value'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-25T13:08:55Z'
updatedAt: '2021-07-25T13:09:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2655'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-25T13:09:14Z'
---
# form.field.Select: Add the ability to pass a record id (keyProperty) as the value

this requires two changes:

`beforeSetValue()` needs to convert a recordId into `record[this.displayField]` if needed.

the change event needs to pass record ids, in case there is a match.

## Timeline

- 2021-07-25T13:08:55Z @tobiu added the `enhancement` label
- 2021-07-25T13:08:55Z @tobiu assigned to @tobiu
- 2021-07-25T13:09:10Z @tobiu referenced in commit `77deda7` - "form.field.Select: Add the ability to pass a record id (keyProperty) as the value #2655"
- 2021-07-25T13:09:14Z @tobiu closed this issue

