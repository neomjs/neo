---
id: 1997
title: fix npm dependency vulnerabilities
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-08T15:49:13Z'
updatedAt: '2021-05-10T09:05:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1997'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-10T09:05:10Z'
---
# fix npm dependency vulnerabilities

jsdoc as well as jsdoc-x are no longer maintained.

this is pretty bad, since it makes upgrading neo as a node module really hard.

i created 2 new forks:
neomjs/jsdoc
neomjs/jsdoc-x

to fix this.

i also had to downgrade siesta-lite all the way to 5.0... =/

## Timeline

- 2021-05-08T15:49:13Z @tobiu added the `enhancement` label
- 2021-05-08T15:49:14Z @tobiu assigned to @tobiu
- 2021-05-08T15:50:40Z @tobiu referenced in commit `28e0911` - "fix npm dependency vulnerabilities #1997"
### @tobiu - 2021-05-10T09:05:10Z

done.

- 2021-05-10T09:05:10Z @tobiu closed this issue

