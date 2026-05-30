---
id: 4574
title: 'table.View: createViewData() => allow renderers to return neo instances'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-07-26T12:54:54Z'
updatedAt: '2024-09-13T02:29:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4574'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:31Z'
---
# table.View: createViewData() => allow renderers to return neo instances

@albert-hashani 

this would be a nice addition: if we return a neo instance, just drop the instance vdom into the cell.

we could also check for neo-configs: if the return value is an object and has a module, ntype or className => create an instance, drop in the vdom.

## Timeline

- 2023-07-26T12:54:54Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:26:58Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:59Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:31Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:31Z @github-actions closed this issue

