---
id: 3474
title: overflow & scaling issues
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-09-29T16:34:44Z'
updatedAt: '2022-09-29T23:15:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3474'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-09-29T23:15:04Z'
---
# overflow & scaling issues

v4.3.0 added a couple new bugs: i wanted to make badges in a way, that they can leave the boundaries of their parent containers.

for my examples, i removed `overflow: hidden` from `tab.Container`, but this is messing up flexbox layouts => tables and lists are no longer scrollable, since they ignore the parent boundaries.

i will try to add some hotfixes to make it more flexible.

## Timeline

- 2022-09-29T16:34:44Z @tobiu added the `bug` label
- 2022-09-29T16:34:44Z @tobiu assigned to @tobiu
- 2022-09-29T16:36:21Z @tobiu referenced in commit `5cf0967` - "#3474 tab.Container: added overflow: hidden for the tab bodies"
- 2022-09-29T16:38:47Z @tobiu referenced in commit `79b6caa` - "#3474 table.Container: added position: relative to the table wrapper nodes and position: absolute to tables. this fixes the covid app."
- 2022-09-29T17:04:49Z @tobiu referenced in commit `1ee7a71` - "#3474 list.Base: added a wrapper div"
- 2022-09-29T17:30:41Z @tobiu referenced in commit `c0c882a` - "#3474 layout.Card: style all direct children, rather than relying on neo-layout-card-item, which can not yet be present"
- 2022-09-29T17:34:16Z @tobiu referenced in commit `925fe23` - "#3474 calendar.view.calendars.ColorsList: adjusted the vdom"
- 2022-09-29T18:36:43Z @tobiu referenced in commit `66dc25a` - "#3474 several list adjustments"
- 2022-09-29T22:24:13Z @tobiu referenced in commit `2346c4c` - "#3474 cleanup"
- 2022-09-29T23:15:04Z @tobiu closed this issue

