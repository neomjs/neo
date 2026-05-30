---
id: 1914
title: 'component.Base: afterSetAppName() => check the css map'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-04-30T17:17:24Z'
updatedAt: '2021-05-05T08:05:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1914'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-05T08:05:06Z'
---
# component.Base: afterSetAppName() => check the css map

this config needs to check if the current className is already inside the css map.

if not: add it, trigger a file load in main, walk up the proto chain until there is a match (or you arrive at component.Base) and add all files to the map (also triggering a file load).

## Timeline

- 2021-04-30T17:17:24Z @tobiu added the `enhancement` label
- 2021-05-05T08:05:06Z @tobiu closed this issue

