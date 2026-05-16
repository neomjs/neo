---
id: 2862
title: re-evaluate the default export syntax
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2022-01-31T22:50:11Z'
updatedAt: '2022-02-01T20:17:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2862'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-02-01T20:17:45Z'
---
# re-evaluate the default export syntax

so far i am using the format:
`export {MainContainer as default};`

we could probably shorten it to:
`export default MainContainer;`

i can no longer remember why i picked the named syntax, it might have been because of the compatibility table:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/export

will take a look into this shortly.

## Timeline

- 2022-01-31T22:50:11Z @tobiu added the `enhancement` label
- 2022-02-01T19:51:16Z @tobiu referenced in commit `545227b` - "re-evaluate the default export syntax #2862"
- 2022-02-01T20:15:39Z @tobiu referenced in commit `4a5b3e7` - "re-evaluate the default export syntax #2862"
- 2022-02-01T20:17:45Z @tobiu closed this issue

