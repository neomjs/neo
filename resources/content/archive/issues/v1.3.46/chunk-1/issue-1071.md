---
id: 1071
title: 'core.Base: getIdKey()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-15T07:43:38Z'
updatedAt: '2020-08-15T07:47:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1071'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-15T07:47:22Z'
---
# core.Base: getIdKey()

so far createId() is using either a "static" passed id or the ntype otherwise.

since ntypes can get very long, it would be nice to optionally default to something else.

## Timeline

- 2020-08-15T07:43:38Z @tobiu added the `enhancement` label
- 2020-08-15T07:43:38Z @tobiu assigned to @tobiu
- 2020-08-15T07:47:09Z @tobiu referenced in commit `9f90394` - "core.Base: getIdKey() #1071"
- 2020-08-15T07:47:22Z @tobiu closed this issue

