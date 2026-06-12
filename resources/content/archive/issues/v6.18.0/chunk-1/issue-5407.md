---
id: 5407
title: 'component.Base: getPlugin() => find via type / ntype'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-05-27T09:26:02Z'
updatedAt: '2024-06-20T12:17:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5407'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-20T12:17:09Z'
---
# component.Base: getPlugin() => find via type / ntype

right now the logic is id based, which is problematic, since all instance ids are supposed to be unique.

instead, i would like to access plugins via:
```
instance.getPlugin('plugin-resizable')
instance.getPlugin('resizable')
```

## Timeline

- 2024-05-27T09:26:02Z @tobiu added the `enhancement` label
- 2024-05-27T09:26:02Z @tobiu assigned to @tobiu
- 2024-06-20T12:04:38Z @tobiu referenced in commit `6e26ec2` - "component.Base: getPlugin() => find via type / ntype #5407"
- 2024-06-20T12:16:55Z @tobiu referenced in commit `adbf4ca` - "#5407 calendar.view.week.plugin.DragDrop: resizablePluginType => enable overriding for custom plugin implementations"
- 2024-06-20T12:17:09Z @tobiu closed this issue

