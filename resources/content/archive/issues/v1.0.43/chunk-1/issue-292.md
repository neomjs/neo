---
id: 292
title: 'component.Gallery: Store with initial sorter'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-03-16T11:51:51Z'
updatedAt: '2020-03-16T12:28:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/292'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-16T12:28:02Z'
---
# component.Gallery: Store with initial sorter

in case the gallery is using a store with an initial defined sorter, it breaks.

probably firing a sort event before having data.

will look into it.

## Timeline

- 2020-03-16T11:51:52Z @tobiu added the `bug` label
- 2020-03-16T11:51:52Z @tobiu assigned to @tobiu
- 2020-03-16T12:27:53Z @tobiu referenced in commit `412ac41` - "component.Gallery: Store with initial sorter #292"
### @tobiu - 2020-03-16T12:28:02Z

fixed.

- 2020-03-16T12:28:02Z @tobiu closed this issue

