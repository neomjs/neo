---
id: 613
title: buildScripts / jsdocx.js
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-05-23T22:03:46Z'
updatedAt: '2020-05-23T22:24:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/613'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-23T22:24:58Z'
---
# buildScripts / jsdocx.js

when deploying 1.1.67 to the online examples, the generate-docs task created a wrong output for docs/output/structure.json.

in detail: paths were prefixed with node_modules/neo.mjs which is not supposed to happen.

will look into it. 

## Timeline

- 2020-05-23T22:03:46Z @tobiu added the `bug` label
- 2020-05-23T22:03:46Z @tobiu assigned to @tobiu
- 2020-05-23T22:24:55Z @tobiu referenced in commit `9e4b8f5` - "buildScripts / jsdocx.js #613"
- 2020-05-23T22:24:58Z @tobiu closed this issue

