---
id: 1267
title: 'tab.Container: moveTo() => adjust the activeIndex'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-16T13:21:38Z'
updatedAt: '2020-10-16T13:35:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1267'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-16T13:35:06Z'
---
# tab.Container: moveTo() => adjust the activeIndex

in case we are moving the active tab, we need to silently adjust the activeIndex config.

## Timeline

- 2020-10-16T13:21:38Z @tobiu added the `enhancement` label
- 2020-10-16T13:21:38Z @tobiu assigned to @tobiu
### @tobiu - 2020-10-16T13:24:16Z

ok, this is a bit more complex:

in case we are moving tab 0 to tab 2 and tab1 is the active tab, the activeIndex will change, although it is not related to the fromIndex or toIndex.

- 2020-10-16T13:34:58Z @tobiu referenced in commit `94880c2` - "tab.Container: moveTo() => adjust the activeIndex #1267"
- 2020-10-16T13:35:06Z @tobiu closed this issue

