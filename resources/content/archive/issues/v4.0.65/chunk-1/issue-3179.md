---
id: 3179
title: 'buildScripts/createClass: adjust class names in case they equal base class names'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-06-21T22:34:23Z'
updatedAt: '2022-07-03T16:35:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3179'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-03T16:35:54Z'
---
# buildScripts/createClass: adjust class names in case they equal base class names

example:
`class Base extends Base {}` will break.

better:
`class Base extends ComponentBase {}`

## Timeline

- 2022-06-21T22:34:23Z @tobiu added the `enhancement` label
- 2022-06-21T22:34:23Z @tobiu assigned to @tobiu
- 2022-07-03T16:30:47Z @tobiu referenced in commit `069fe7e` - "buildScripts/createClass: adjust class names in case they equal base class names #3179"
- 2022-07-03T16:35:54Z @tobiu closed this issue

