---
id: 21
title: 'Discussion: KeyNav -> boost the onKeyDown trigger speed'
state: CLOSED
labels:
  - enhancement
  - discussion
  - stale
assignees: []
createdAt: '2019-11-17T16:33:15Z'
updatedAt: '2024-09-29T02:39:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/21'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:39:15Z'
---
# Discussion: KeyNav -> boost the onKeyDown trigger speed

I am thinking about an optional flag for the keyNav. Especially when navigating through the helix items using the arrow keys, it feels like you move 5 / 300 items per second. The reason seems to be that the keydown event does not fire more often in case you keep a key pressed.

My current idea: save the last x onKeyDown events (key & timestamp). In case the same key triggers x times within the time interval y, fire the event handler again with a delay. E.g. the app worker gets the event every 200ms, fire it again with a 100ms delay. If it keeps firing "longer", add 3 delayed handler calls (50, 100, 150ms). OnKeyUp should cancel all timeout calls to stop at the current position.

We could further polish this in case we keep track of the current FPS rate and ensure there is max 1 movement within 1 animation frame (follow up ticket).

Thoughts?

## Timeline

- 2019-11-17T16:33:15Z @tobiu added the `enhancement` label
- 2019-11-17T16:34:07Z @tobiu added the `discussion` label
### @github-actions - 2024-09-15T02:37:28Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-15T02:37:29Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:39:14Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:39:15Z @github-actions closed this issue

