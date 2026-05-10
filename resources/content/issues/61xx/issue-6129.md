---
id: 6129
title: 'manager.Focus: tree walking'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2024-11-22T13:01:09Z'
updatedAt: '2025-04-05T15:31:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6129'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# manager.Focus: tree walking

I think we can do better here:

Right now, we parse the DOM paths and map them to related neo components. While this does work fine for nested widgets inside the DOM tree, it does not honor overlays as good as it should.

We should only fetch the closest component inside the `focusin` & `focusout` path and from there use the component tree.
1. find the closest common ancestor
2. walk the out path component tree upwards and fire `focusLeave`
3. walk the in path component tree upwards and fire `focusEnter`
4. fire `focusMove` on the common ancestor

It relies on `floating` components to be placed inside the component tree correctly.

@rwaters 

## Timeline

- 2024-11-22T13:01:09Z @tobiu added the `enhancement` label
### @github-actions - 2025-02-21T02:32:35Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-02-21T02:32:35Z @github-actions added the `stale` label
### @github-actions - 2025-03-07T02:38:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-03-07T02:38:08Z @github-actions closed this issue
- 2025-04-05T15:31:39Z @tobiu reopened this issue
- 2025-04-05T15:31:53Z @tobiu removed the `stale` label
- 2025-04-05T15:31:53Z @tobiu added the `no auto close` label

