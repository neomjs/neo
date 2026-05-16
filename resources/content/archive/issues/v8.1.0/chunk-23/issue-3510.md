---
id: 3510
title: 'button.Base: beforeSetIconCls() => the logic breaks in case we add spaces'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-10-02T20:07:53Z'
updatedAt: '2022-10-02T20:09:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3510'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-10-02T20:09:05Z'
---
# button.Base: beforeSetIconCls() => the logic breaks in case we add spaces

e.g. inside `examples.tab.container.MainContainer` when typing into the `iconCls` TextField => "fa ".

this will get converted into `['fa', '']`.

we need to add a `Boolean` filter.

i will also cleanup `afterSetIconCls()`.

## Timeline

- 2022-10-02T20:07:53Z @tobiu added the `bug` label
- 2022-10-02T20:07:54Z @tobiu assigned to @tobiu
- 2022-10-02T20:08:42Z @tobiu referenced in commit `159598f` - "button.Base: beforeSetIconCls() => the logic breaks in case we add spaces #3510"
- 2022-10-02T20:09:05Z @tobiu closed this issue

