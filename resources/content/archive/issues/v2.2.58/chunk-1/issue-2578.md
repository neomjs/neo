---
id: 2578
title: 'menu.List: focus-leave management'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-07T10:20:35Z'
updatedAt: '2021-07-07T18:42:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2578'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-07T18:42:24Z'
---
# menu.List: focus-leave management

This one is a bit tricky:

If we click somewhere outside of the menu tree, floating menus should hide (unmount).

Since only one menu tree can (should) be visible at a given time, we can probably just check the dom event path to see if any parent is a menu.

## Timeline

- 2021-07-07T10:20:35Z @tobiu added the `enhancement` label
- 2021-07-07T10:20:35Z @tobiu assigned to @tobiu
- 2021-07-07T14:20:46Z @tobiu referenced in commit `bdd88aa` - "menu.List: focus-leave management #2578 (in progress)"
- 2021-07-07T18:25:42Z @tobiu referenced in commit `26e3b97` - "#2578 menu.List: menuFocus_ config"
- 2021-07-07T18:27:13Z @tobiu referenced in commit `3275981` - "#2578 menu.List: isRoot config"
- 2021-07-07T18:27:58Z @tobiu referenced in commit `253c8b8` - "#2578 menu.List: passing isRoot: false to sub-menus"
- 2021-07-07T18:42:12Z @tobiu referenced in commit `df02e4a` - "menu.List: focus-leave management #2578"
- 2021-07-07T18:42:24Z @tobiu closed this issue

