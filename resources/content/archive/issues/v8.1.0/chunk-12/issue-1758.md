---
id: 1758
title: 'controller.Component: onViewParsed() is obsolete now'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-13T14:53:10Z'
updatedAt: '2021-04-13T15:06:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1758'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-13T15:06:21Z'
---
# controller.Component: onViewParsed() is obsolete now

you can just use `onViewConstructed()` now instead.

I will search inside the examples & apps folders now to double-check if there are matches.

## Timeline

- 2021-04-13T14:53:10Z @tobiu added the `enhancement` label
- 2021-04-13T14:53:10Z @tobiu assigned to @tobiu
- 2021-04-13T14:54:13Z @tobiu referenced in commit `f67befb` - "controller.Component: onViewParsed() is obsolete now #1758 => removed inside the controller class"
- 2021-04-13T15:03:31Z @tobiu referenced in commit `1b16079` - "#1758 controller.Component: added a placeholder fn for onViewConstructed(), examples.model.inlineNoModel.MainContainerController: switched to this method"
- 2021-04-13T15:05:30Z @tobiu referenced in commit `2af8a53` - "#1758 Website.view.MainContainerController: switched to onViewConstructed()"
### @tobiu - 2021-04-13T15:06:21Z

done.

- 2021-04-13T15:06:21Z @tobiu closed this issue

