---
id: 4353
title: 'component.Base: afterSetHidden() => add a case for hidden true && oldValue === undefined'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-05-02T09:16:55Z'
updatedAt: '2023-05-02T09:20:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4353'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-05-02T09:20:20Z'
---
# component.Base: afterSetHidden() => add a case for hidden true && oldValue === undefined

in case a container item gets created with `hidden: true`, we want to add `removeDom: true` on the vdom root of the item, without triggering an `unmount()` call.

@Dinkh 

## Timeline

- 2023-05-02T09:16:55Z @tobiu added the `bug` label
- 2023-05-02T09:16:56Z @tobiu assigned to @tobiu
- 2023-05-02T09:19:46Z @tobiu referenced in commit `07a48a8` - "component.Base: afterSetHidden() => add a case for hidden true && oldValue === undefined #4353"
- 2023-05-02T09:20:20Z @tobiu closed this issue

