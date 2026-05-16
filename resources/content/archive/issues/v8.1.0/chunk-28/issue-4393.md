---
id: 4393
title: 'component.Base: getReference()'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-05-08T16:44:37Z'
updatedAt: '2024-09-12T02:29:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4393'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:17Z'
---
# component.Base: getReference()

thinking more about the recent change from: https://github.com/neomjs/neo/issues/4387

in case a view does not have its own controller, the results can now be different: imagine a parent level controller with child views using the same reference names.

for a clear solution, a component needs to cache references on its own. since we do not want to duplicate code, we will need to extract the logic into a different file. a mixin would be ideal, in case it could support configs or class fields as well (which it does not do yet => limited to methods).


## Timeline

- 2023-05-08T16:44:37Z @tobiu added the `enhancement` label
### @tobiu - 2023-05-09T13:13:01Z

i will revert the last changes first, to prevent an inconsistent behavior from prior versions.

- 2023-05-09T13:15:58Z @tobiu referenced in commit `b02b8aa` - "component.Base: getReference() #4393"
### @github-actions - 2024-08-29T02:27:24Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:24Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:17Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:17Z @github-actions closed this issue

