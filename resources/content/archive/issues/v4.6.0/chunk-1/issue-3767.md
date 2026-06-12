---
id: 3767
title: 'component.Base: baseCls'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-04T11:43:04Z'
updatedAt: '2023-01-04T14:06:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3767'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-04T14:06:39Z'
---
# component.Base: baseCls

to make extending of classes more convenient, we will introduce a `baseCls` config, which will store most of the rules which are currently inside `cls`.

when creating instances of existing classes, you will no longer need to re-add all base classes and you can instead only add your custom extra rules inside `cls`.

of course you can also override `baseCls` to remove rules which you don't want to use.

## Timeline

- 2023-01-04T11:43:04Z @tobiu added the `enhancement` label
- 2023-01-04T11:43:04Z @tobiu assigned to @tobiu
- 2023-01-04T12:29:04Z @tobiu referenced in commit `fe9f067` - "component.Base: baseCls #3767 src folder"
- 2023-01-04T12:45:24Z @tobiu referenced in commit `394bf94` - "#3767 apps folder"
- 2023-01-04T12:49:19Z @tobiu referenced in commit `2cfd581` - "#3767 docs folder"
- 2023-01-04T12:58:28Z @tobiu referenced in commit `109a7fe` - "#3767 examples folder"
- 2023-01-04T13:41:37Z @tobiu referenced in commit `5d4ffdd` - "#3767 component.Base: beforeSetCls()"
### @tobiu - 2023-01-04T14:06:39Z

@Dinkh 

- 2023-01-04T14:06:39Z @tobiu closed this issue

