---
id: 5212
title: 'selection.Model: select() should only optionally set the focus'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2024-02-09T15:15:32Z'
updatedAt: '2024-09-12T02:28:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5212'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:32Z'
---
# selection.Model: select() should only optionally set the focus

Especially in case we want to programmatically select an item, changing the focus can be problematic.

Example: we click on a next button (apps/form) which selects a new item inside the related side nav list. Moving the focus inside the side nav at this point is not the desired UX.

However: some components (e.g. gallery & helix) still want to (and should) do it.

So, a new config like `focusOnSelect` makes sense.

@mxmrtns 



## Timeline

- 2024-02-09T15:15:32Z @tobiu added the `enhancement` label
### @github-actions - 2024-08-29T02:25:49Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:25:49Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:31Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:32Z @github-actions closed this issue

