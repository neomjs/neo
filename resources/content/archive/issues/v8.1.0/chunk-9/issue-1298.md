---
id: 1298
title: 'draggable.tab.header.toolbar.SortZone: disable the tab strip animation after a drop happens'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-24T13:00:14Z'
updatedAt: '2020-10-24T14:04:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1298'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-24T14:04:41Z'
---
# draggable.tab.header.toolbar.SortZone: disable the tab strip animation after a drop happens

drag&drop based re-sorting can change the active index.

in this case, the active tab indicator should not move with an animation.

an edge case, but to make it perfect it should move instantly.

## Timeline

- 2020-10-24T13:00:14Z @tobiu added the `enhancement` label
- 2020-10-24T13:00:15Z @tobiu assigned to @tobiu
### @tobiu - 2020-10-24T13:03:14Z

the logic needs to be inside: draggable.tab.header.toolbar.SortZone.

will adjust the ticket title.

- 2020-10-24T13:03:23Z @tobiu changed title from **draggable.toolbar.SortZone: disable the tab strip animation after a drop happens** to **draggable.tab.header.toolbar.SortZone: disable the tab strip animation after a drop happens**
### @tobiu - 2020-10-24T13:45:53Z

it turns out, that adding a style like `animation: none !important` to the toolbar or each button does not override the value inside the button indicator child node (only tested in Chrome).

we need to add a custom css rule to make it work.

- 2020-10-24T13:59:22Z @tobiu referenced in commit `dd9771c` - "draggable.tab.header.toolbar.SortZone: disable the tab strip animation after a drop happens #1298"
### @tobiu - 2020-10-24T14:00:20Z

i will test adding the new cls onDragStart(), so that the dragProxyEl tab indicator does not flicker.

- 2020-10-24T14:03:15Z @tobiu referenced in commit `cb61028` - "#1298 adding the rule onDragStart() already to ensure the proxyEl indicator does not flicker"
- 2020-10-24T14:04:41Z @tobiu closed this issue

