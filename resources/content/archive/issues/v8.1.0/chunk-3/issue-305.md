---
id: 305
title: 'Neo.Main: editRoute()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-03-17T20:16:08Z'
updatedAt: '2020-03-18T20:03:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/305'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-18T20:03:23Z'
---
# Neo.Main: editRoute()

remote method for the app worker.

setRoute() is already in place.

editRoute() needs one param => {Object} tokens

the window.location.hash needs to get tokenized (e.g. Neo.main.DomAccess: parseHash()) and all keys inside the tokens param need to get replaced while keeping all other existing ones.

## Timeline

- 2020-03-17T20:16:08Z @tobiu added the `enhancement` label
- 2020-03-17T20:17:59Z @tobiu cross-referenced by #306
- 2020-03-18T15:51:12Z @tobiu referenced in commit `c17cafe` - "Neo.Main: editRoute() #305 => in progress"
- 2020-03-18T19:58:02Z @tobiu referenced in commit `960ba3c` - "Neo.Main: editRoute() #305"
### @tobiu - 2020-03-18T20:03:23Z

done.

- 2020-03-18T20:03:23Z @tobiu closed this issue

