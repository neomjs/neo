---
id: 173
title: 'manager.DomEvent: bubble events'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2019-12-12T18:33:23Z'
updatedAt: '2019-12-12T18:34:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/173'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2019-12-12T18:34:07Z'
---
# manager.DomEvent: bubble events

this could be a breaking change:

right now, events get stopped once the first component containing the event type gets found.
this is ignoring the delegation path, which was not intended.

i will change it so that events do bubble up by default.

## Timeline

- 2019-12-12T18:33:23Z @tobiu added the `enhancement` label
- 2019-12-12T18:33:24Z @tobiu assigned to @tobiu
- 2019-12-12T18:33:43Z @tobiu referenced in commit `21c924c` - "manager.DomEvent: bubble events #173"
### @tobiu - 2019-12-12T18:34:07Z

pushed

- 2019-12-12T18:34:07Z @tobiu closed this issue

