---
id: 5171
title: Event orientationchange
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-12-12T12:31:20Z'
updatedAt: '2023-12-12T12:42:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5171'
author: Dinkh
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-12T12:42:08Z'
---
# Event orientationchange

For mobile development, we need the orientationchange event as a global event.

## Timeline

- 2023-12-12T12:31:20Z @Dinkh added the `enhancement` label
### @Dinkh - 2023-12-12T12:42:08Z

Will be solved in the next version

@example
```
const me = this,
          orientation =  await Neo.Main.getByPath({path: 'window.orientation'});

if ((orientation % 180) !== 0) me.component.isLoading = 'Please rotate device';
me.component.app.on('orientationchange', me.onOrientationChange, me);
```

```
data = {
    orientation: 90,
    layout: 'landscape'
}
```

- 2023-12-12T12:42:08Z @Dinkh closed this issue

