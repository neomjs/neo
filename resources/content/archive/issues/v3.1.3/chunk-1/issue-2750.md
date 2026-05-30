---
id: 2750
title: 'list.plugin.Animate: support for collection filtering'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-10-03T17:29:57Z'
updatedAt: '2022-01-24T20:06:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2750'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-24T20:06:06Z'
---
# list.plugin.Animate: support for collection filtering

Items inside `examples.list.animate.MainContainer` has an `isOnline` record field, which we can use for testing.

removed items: set the opacity to 0, css based transition (same duration as the item movements). once the transition is done, remove the item from the vdom.

added items: add the item to the vdom with an opacity of 0. inside the next animation frame, set the opacity to 1.



## Timeline

- 2021-10-03T17:29:57Z @tobiu added the `enhancement` label
### @tobiu - 2022-01-24T20:06:06Z

done

- 2022-01-24T20:06:06Z @tobiu closed this issue

