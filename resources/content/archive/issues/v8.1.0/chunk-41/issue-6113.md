---
id: 6113
title: 'component.Base: updateVdom() => store the resolver for silent vdom updates'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-14T18:00:32Z'
updatedAt: '2024-11-14T18:03:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6113'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-14T18:03:42Z'
---
# component.Base: updateVdom() => store the resolver for silent vdom updates

super edge case and did not happen before.

in theory a dev could do something like:

```
this.silentVdomUpdate = true;
this.promiseUpdate().then(() => {console.log('done')});
this.silentVdomUpdate = false;
```

## Timeline

- 2024-11-14T18:00:32Z @tobiu added the `enhancement` label
- 2024-11-14T18:00:32Z @tobiu assigned to @tobiu
- 2024-11-14T18:03:36Z @tobiu referenced in commit `588c966` - "component.Base: updateVdom() => store the resolver for silent vdom updates #6113"
- 2024-11-14T18:03:42Z @tobiu closed this issue

