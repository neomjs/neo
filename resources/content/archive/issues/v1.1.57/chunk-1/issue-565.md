---
id: 565
title: main.addon.HighlightJS => load script order
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-19T18:12:53Z'
updatedAt: '2020-05-19T18:16:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/565'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-19T18:16:13Z'
---
# main.addon.HighlightJS => load script order

i noticed that sometimes the hljs linenumbers file does load faster than the hljs lib. this is a problem, since linenumbers does not work in case hljs is not already there.

we need to replace addScript with the promise based loadScript() and use then() to load the line-numbers.

## Timeline

- 2020-05-19T18:12:53Z @tobiu added the `enhancement` label
- 2020-05-19T18:12:54Z @tobiu assigned to @tobiu
- 2020-05-19T18:15:55Z @tobiu referenced in commit `6652d73` - "main.addon.HighlightJS => load script order #565"
- 2020-05-19T18:16:13Z @tobiu closed this issue

