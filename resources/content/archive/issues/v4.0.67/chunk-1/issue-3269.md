---
id: 3269
title: 'Multi-window scope: adding support for re-opening an app'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-07-06T09:29:07Z'
updatedAt: '2022-07-09T09:48:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3269'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-09T09:48:50Z'
---
# Multi-window scope: adding support for re-opening an app

Inside e.g. the shared covid dashboard, we can expand views like the helix into new browser windows.

this does work fine for the first opening => we get a new app name and the theme map will store flags for added css files (delta updates). closing the helix and displaying it correctly works as well, since the original window already contains the required css.

however, in case we expand the helix into a new window again (using the same app name), the css won't get added, since the flags inside the map are already set.

we need a new algorithm to remove an app from the theme map and we should trigger it when destroying an app (inside the shared workers context).

## Timeline

- 2022-07-06T09:29:07Z @tobiu added the `enhancement` label
- 2022-07-06T09:29:07Z @tobiu assigned to @tobiu
### @tobiu - 2022-07-06T09:29:19Z

@Dinkh 

### @Dinkh - 2022-07-06T09:38:27Z

This is a bug, not an enhancement🐞 
👍 

### @tobiu - 2022-07-06T10:22:10Z

i would actually stick to enhancement, but it depends on the definition.
1. bug: an implemented feature does not work as expected
2. enhancement: a feature is not implemented yet

gray zone for this one i guess :)

### @Dinkh - 2022-07-06T10:53:11Z

Enhancement: Now you can even reopen a window
Bug: I expect to even reopen the window

I would tend to bug, but from the naming of the ticket it is an enhancement ;)

- 2022-07-09T09:48:28Z @tobiu referenced in commit `868ece9` - "Multi-window scope: adding support for re-opening an app #3269"
### @tobiu - 2022-07-09T09:48:50Z

the "bug-feature" is resolved now. enjoy.

- 2022-07-09T09:48:50Z @tobiu closed this issue

