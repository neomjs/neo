---
id: 2878
title: 'list.plugin.Animate: onStoreSort() => support for Neo.list.Component'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-02-13T16:29:38Z'
updatedAt: '2022-02-13T16:30:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2878'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-02-13T16:30:02Z'
---
# list.plugin.Animate: onStoreSort() => support for Neo.list.Component

`Neo.list.Component` is using index-based item ids to re-use component instances as much as possible.

However, this makes it tricky to apply an animated sorting. I will split the logic for list.Base and list.Component, to keep the algorithms reasonable.

## Timeline

- 2022-02-13T16:29:38Z @tobiu added the `enhancement` label
- 2022-02-13T16:29:38Z @tobiu assigned to @tobiu
- 2022-02-13T16:29:56Z @tobiu referenced in commit `3e014d1` - "list.plugin.Animate: onStoreSort() => support for Neo.list.Component #2878"
- 2022-02-13T16:30:02Z @tobiu closed this issue

