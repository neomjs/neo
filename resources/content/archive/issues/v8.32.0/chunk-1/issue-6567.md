---
id: 6567
title: 'grid.plugin.AnimateRows: use CSS vars'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-10T10:35:36Z'
updatedAt: '2025-03-12T12:02:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6567'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-12T12:02:23Z'
---
# grid.plugin.AnimateRows: use CSS vars

* The strategy to write into a stylesheet at run-time is powerful, but originated in neo at a time were there were no CSS vars in use
* Since we have those now, the plugin should add a selector to `grid.View`
* The plugin needs its own (S)CSS file
* CSS vars for duration & easing
* Changing the values of these 2 => change the value of the related CSS var inside the `grid.View` style attribute

## Timeline

- 2025-03-10T10:35:36Z @tobiu added the `enhancement` label
- 2025-03-10T10:35:36Z @tobiu assigned to @tobiu
- 2025-03-12T12:02:16Z @tobiu referenced in commit `bee8ab1` - "grid.plugin.AnimateRows: use CSS vars #6567"
- 2025-03-12T12:02:23Z @tobiu closed this issue

