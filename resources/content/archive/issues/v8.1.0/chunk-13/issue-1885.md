---
id: 1885
title: 'Covid.view.MainContainerController: onMainViewMounted()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-28T16:02:09Z'
updatedAt: '2021-04-28T16:27:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1885'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-28T16:27:52Z'
---
# Covid.view.MainContainerController: onMainViewMounted()

after switching to lazy load all covid app main tabs, we can no longer use `onMainViewMounted()` since at this point at most 1 tab is there.

instead, we need to trigger the logic when a new tab gets activated. `onHashChange()` could work.

diving into this now.

## Timeline

- 2021-04-28T16:02:09Z @tobiu added the `enhancement` label
- 2021-04-28T16:02:09Z @tobiu assigned to @tobiu
- 2021-04-28T16:26:35Z @tobiu referenced in commit `367be2f` - "Covid.view.MainContainerController: onMainViewMounted() #1885"
- 2021-04-28T16:27:49Z @tobiu referenced in commit `40f5825` - "#1885 Covid.view.MainContainerController: onTabMove() => adjusted the listeners assigned flags order"
- 2021-04-28T16:27:52Z @tobiu closed this issue

