---
id: 4115
title: Container different root Show/Hide Problem
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-02-21T12:06:18Z'
updatedAt: '2023-05-09T13:31:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4115'
author: Dinkh
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-09T13:31:23Z'
---
# Container different root Show/Hide Problem

If you change the VdomItemsRoot, show/hide (mount/unmount) does not find the correct parentId subitem
Container.insert should check for different parentId if vDomItemsRoot is different

*Example*
```
    getVdomItemsRoot() {
        return this.getVdomRoot().cn[0];
    }
```

**Possible Solution**
parentId: foo,
parentDomId: bar

## Timeline

- 2023-02-21T12:06:18Z @Dinkh added the `bug` label
- 2023-05-09T13:31:18Z @tobiu referenced in commit `6ecaa58` - "Container different root Show/Hide Problem #4115"
- 2023-05-09T13:31:23Z @tobiu closed this issue

