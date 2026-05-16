---
id: 5391
title: 'collection.Base: isObject() checks no longer honor records'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-04-12T15:06:52Z'
updatedAt: '2024-04-12T15:33:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5391'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-04-12T15:33:08Z'
---
# collection.Base: isObject() checks no longer honor records

this causes issues, e.g. for finding indexes properly.

we need a new `isItem()` helper to check for objects or records.

## Timeline

- 2024-04-12T15:06:53Z @tobiu added the `bug` label
- 2024-04-12T15:06:53Z @tobiu assigned to @tobiu
- 2024-04-12T15:30:59Z @tobiu referenced in commit `15f4461` - "collection.Base: isObject() checks no longer honor records #5391 & cleanup"
- 2024-04-12T15:33:08Z @tobiu closed this issue

