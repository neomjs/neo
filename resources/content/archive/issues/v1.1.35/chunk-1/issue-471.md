---
id: 471
title: 'Covid.view.OpenStreetMapsComponent: sometimes does not initially show data'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-04-13T16:24:00Z'
updatedAt: '2020-04-14T18:19:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/471'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-04-14T18:19:11Z'
---
# Covid.view.OpenStreetMapsComponent: sometimes does not initially show data

unless you hit the reload data button.

## Timeline

- 2020-04-13T16:24:00Z @tobiu added the `bug` label
- 2020-04-14T18:17:42Z @tobiu referenced in commit `baf24e9` - "https://github.com/neomjs/neo/issues/471"
### @tobiu - 2020-04-14T18:19:11Z

yikes, this one was tricky.

the counterpart to map.on => map.off did NOT remove the listener.

when adding map.on('load'), and checking for map.loaded() inside the handler, it can be false in case we add layers / sources.

- 2020-04-14T18:19:11Z @tobiu closed this issue

