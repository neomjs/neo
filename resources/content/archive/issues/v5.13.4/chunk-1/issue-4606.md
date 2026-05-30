---
id: 4606
title: 'menu.List: add support for the enter key'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-07-31T12:35:34Z'
updatedAt: '2023-07-31T14:16:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4606'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-31T14:16:35Z'
---
# menu.List: add support for the enter key

enter should trigger the handler, in case it does exist.

for leave items, enter should unmount the menu, in case the menu is floating.

for non-leave items, enter should toggle the visibility state of the related sub-menu.

## Timeline

- 2023-07-31T12:35:34Z @tobiu added the `enhancement` label
- 2023-07-31T12:35:34Z @tobiu assigned to @tobiu
- 2023-07-31T14:16:10Z @tobiu referenced in commit `2c2284e` - "menu.List: add support for the enter key #4606"
- 2023-07-31T14:16:35Z @tobiu closed this issue

