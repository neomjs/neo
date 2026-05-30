---
id: 28
title: 'classSystem: do not delete the module config when creating instances'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2019-11-17T17:24:47Z'
updatedAt: '2019-12-05T13:44:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/28'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-05T13:44:40Z'
---
# classSystem: do not delete the module config when creating instances

since the classes are kept in memory anyway, it is not important to delete this reference.

advantage: you can search inside the component tree using the module config.

## Timeline

- 2019-11-17T17:24:47Z @tobiu added the `enhancement` label
### @tobiu - 2019-12-05T13:44:40Z

resolved already.

- 2019-12-05T13:44:40Z @tobiu closed this issue

