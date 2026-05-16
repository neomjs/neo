---
id: 2564
title: 'Refactoring: list.Menu => menu.Panel'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-07-06T11:28:35Z'
updatedAt: '2021-07-06T17:41:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2564'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-07-06T17:41:01Z'
---
# Refactoring: list.Menu => menu.Panel

It is more flexible to use `container.Panel` as the base class, in case someone would want to add headers / footers to menus.

The panel needs to contain the list as a child item.

## Timeline

- 2021-07-06T11:28:35Z @tobiu added the `enhancement` label
- 2021-07-06T11:28:35Z @tobiu assigned to @tobiu
- 2021-07-06T11:33:42Z @tobiu referenced in commit `9ca450b` - "#2564 menu.Panel: base class"
- 2021-07-06T11:36:18Z @tobiu referenced in commit `8f72448` - "#2564 list.Menu => menu.List"
- 2021-07-06T11:43:44Z @tobiu referenced in commit `688d8d0` - "#2564 list.Menu => menu.List => scss"
- 2021-07-06T11:48:10Z @tobiu referenced in commit `7ed77eb` - "#2564 menu.List => adjusted the example"
- 2021-07-06T11:52:24Z @tobiu referenced in commit `2e611a1` - "#2564 menu.Panel: list_, listConfig"
- 2021-07-06T11:57:12Z @tobiu referenced in commit `c2280fe` - "#2564 menu.Panel: beforeSetList()"
- 2021-07-06T11:59:33Z @tobiu referenced in commit `902d389` - "#2564 menu.Panel: afterSetList()"
- 2021-07-06T12:04:25Z @tobiu referenced in commit `effbfa3` - "#2564 examples.menu.panel"
- 2021-07-06T12:06:38Z @tobiu referenced in commit `61595dd` - "#2564 menu.Panel: afterSetList()"
- 2021-07-06T12:42:06Z @tobiu referenced in commit `81fa9d4` - "#2564 menu.Panel: styling"
- 2021-07-06T12:44:17Z @tobiu referenced in commit `f5054b2` - "#2564 menu.List: adjusted the scss var names (menu => menu-list)"
- 2021-07-06T12:47:40Z @tobiu referenced in commit `61bf7ed` - "#2564 menu.Model"
- 2021-07-06T12:49:18Z @tobiu referenced in commit `458e434` - "#2564 menu.Model: doc comments"
- 2021-07-06T12:53:25Z @tobiu referenced in commit `d298be4` - "#2564 menu.Store"
- 2021-07-06T12:57:06Z @tobiu referenced in commit `febd8da` - "#2564 menu.List: using menu.Store"
- 2021-07-06T13:01:22Z @tobiu referenced in commit `ee6b531` - "#2564 examples.menu.panel.MainStore: extending menu.Store"
- 2021-07-06T13:03:48Z @tobiu referenced in commit `3effae1` - "#2564 examples.menu.list.MainStore: extending menu.Store"
- 2021-07-06T13:16:55Z @tobiu referenced in commit `b14abb5` - "#2564 menu.Panel: menuItems_ config & logic"
- 2021-07-06T17:41:01Z @tobiu closed this issue

