---
id: 2611
title: 'data.RecordFactory: isRecord() => support for dist/prod'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-16T12:16:45Z'
updatedAt: '2021-07-16T12:17:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2611'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-16T12:17:24Z'
---
# data.RecordFactory: isRecord() => support for dist/prod

Checking the ctor.name won't work in dist/prod, since class names do get minified.

We need a new record property (symbol) to resolve this.

## Timeline

- 2021-07-16T12:16:46Z @tobiu added the `enhancement` label
- 2021-07-16T12:16:46Z @tobiu assigned to @tobiu
- 2021-07-16T12:17:07Z @tobiu referenced in commit `aa39238` - "data.RecordFactory: isRecord() => support for dist/prod #2611"
- 2021-07-16T12:17:24Z @tobiu closed this issue

