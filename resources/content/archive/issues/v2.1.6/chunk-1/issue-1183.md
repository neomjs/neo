---
id: 1183
title: buildScripts/docs/jsdocx.js => sub repo parsing
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-09-10T12:34:42Z'
updatedAt: '2021-05-21T21:15:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1183'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-21T21:15:17Z'
---
# buildScripts/docs/jsdocx.js => sub repo parsing

just noticed that parsing neo inside a node_module (e.g. for https://github.com/neomjs/covid-dashboard) creates wrong example path outputs.

examples VS node_modules/neo.mjs/examples.

need to take a closer look into this.

## Timeline

- 2020-09-10T12:34:43Z @tobiu added the `enhancement` label
- 2021-05-21T21:15:17Z @tobiu closed this issue

