---
id: 4866
title: 'controller.Base: onConstructed() => pass the old hash value'
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-09-07T21:02:03Z'
updatedAt: '2024-09-13T02:29:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4866'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:10Z'
---
# controller.Base: onConstructed() => pass the old hash value

this would be a very useful enhancement for controllers, which get created at run-time, where a hash-change has already happened. we need to delay this one a bit though, since it would have a pretty big impact on our current client-project, which needs to get prepared for the change first.

old code:
```
currentHash && this.onHashChange(currentHash, null);
```

new code:
```
currentHash && this.onHashChange(currentHash, HashHistory.second());
```

## Timeline

- 2023-09-07T21:02:03Z @tobiu added the `enhancement` label
- 2023-09-07T21:02:03Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:26:43Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:43Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:10Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:10Z @github-actions closed this issue

