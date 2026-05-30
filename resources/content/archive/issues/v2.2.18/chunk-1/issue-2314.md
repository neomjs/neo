---
id: 2314
title: 'data.RecordFactory: add the isClass flag to the Record class ctor'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-07T09:26:50Z'
updatedAt: '2021-06-07T09:27:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2314'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-07T09:27:13Z'
---
# data.RecordFactory: add the isClass flag to the Record class ctor

and remove the custom check from `Neo.clone()`. this one does not work for dist/prod, since class names get minified.

## Timeline

- 2021-06-07T09:26:50Z @tobiu added the `enhancement` label
- 2021-06-07T09:26:50Z @tobiu assigned to @tobiu
- 2021-06-07T09:27:09Z @tobiu referenced in commit `9eaeda7` - "https://github.com/neomjs/neo/issues/2314"
- 2021-06-07T09:27:13Z @tobiu closed this issue

