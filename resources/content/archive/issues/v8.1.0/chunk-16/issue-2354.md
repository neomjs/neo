---
id: 2354
title: 'calendar.view.MainContainer: add a view model'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-13T14:48:06Z'
updatedAt: '2021-06-13T14:57:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2354'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-13T14:57:08Z'
---
# calendar.view.MainContainer: add a view model

Normally I don't use VMs for component creation.

The calendar is more like an app though, so it does make sense here:

We need to pass less configs to sub views and this enables you to use sub-views on their own (adding the VM).

Another benefit is that you can override "global" VM props with adding a VM for a child view.
E.g. in case you want to use a different time format only inside the week view or only allow editing events there.

## Timeline

- 2021-06-13T14:48:06Z @tobiu added the `enhancement` label
- 2021-06-13T14:48:06Z @tobiu assigned to @tobiu
- 2021-06-13T14:53:18Z @tobiu referenced in commit `e39ed38` - "calendar.view.MainContainer: add a view model #2354"
- 2021-06-13T14:56:57Z @tobiu referenced in commit `c732832` - "#2354 calendar.week.Component: onEventDoubleClick() => check for a VM data prop"
- 2021-06-13T14:57:08Z @tobiu closed this issue

