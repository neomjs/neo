---
id: 505
title: Touch events concept
state: CLOSED
labels:
  - enhancement
  - help wanted
  - discussion
  - stale
assignees: []
createdAt: '2020-04-24T15:34:20Z'
updatedAt: '2024-09-28T02:31:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/505'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:45Z'
---
# Touch events concept

To be fair, I did not look at native touch-related browser events for many (5?) years.

Was thinking that at this point there will be events like swipe or rotate out of the box.

This assumption was naive, I did not even find proposals.

Took a quick look at:

https://github.com/hammerjs/hammer.js

And created a ticket, since (again) invalid import statements.

https://github.com/hammerjs/hammer.js/issues/1249

From the concept we do need something similar for neo. I would prefer to use global (doc.body) events and delegate them through the cmp-tree.

we can just pass the basic touch events from main to the app worker and add a manager class there which can map the touch based input into events which do make sense.

thoughts?

## Timeline

- 2020-04-24T15:34:20Z @tobiu added the `enhancement` label
- 2020-04-24T15:34:20Z @tobiu added the `help wanted` label
- 2020-04-24T15:34:20Z @tobiu added the `discussion` label
### @github-actions - 2024-09-14T02:27:34Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:34Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:44Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:45Z @github-actions closed this issue

