---
id: 5465
title: Neo.config.renderCountDeltas => make it configurable and multi-window
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-23T17:30:07Z'
updatedAt: '2024-06-23T17:32:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5465'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-23T17:32:09Z'
---
# Neo.config.renderCountDeltas => make it configurable and multi-window

I had to smile when i found the spot. i guess one of the first things created in Neo from Rich @rwaters back in the days.

Since it is actually still in use for the helix demo, we need to make it configurable at run-time and let it support multi-window => moving the helix into a separate window needs to start the logic again inside the new main thread.



## Timeline

- 2024-06-23T17:30:07Z @tobiu added the `enhancement` label
- 2024-06-23T17:30:07Z @tobiu assigned to @tobiu
- 2024-06-23T17:31:26Z @tobiu referenced in commit `702c05c` - "Neo.config.renderCountDeltas => make it configurable and multi-window #5465"
- 2024-06-23T17:32:09Z @tobiu closed this issue

