---
id: 229
title: 'container.Base: onInsert => parent controller'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-02-04T15:56:58Z'
updatedAt: '2024-08-31T08:54:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/229'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-31T08:54:48Z'
---
# container.Base: onInsert => parent controller

in case a container which has a controller OR a parent view with a controller inserts a new child component without a controller dynamically, it is important to parse the class with the parent controller to honor string based listeners.

## Timeline

- 2020-02-04T15:56:58Z @tobiu added the `enhancement` label
- 2020-02-04T16:04:22Z @tobiu cross-referenced by #230
### @tobiu - 2024-08-31T08:54:48Z

already done.

- 2024-08-31T08:54:48Z @tobiu closed this issue

