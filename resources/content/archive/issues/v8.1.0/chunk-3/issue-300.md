---
id: 300
title: 'manager.DomEvent: fire() => add the receiver component as a param prop'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-03-16T19:47:27Z'
updatedAt: '2020-03-16T19:48:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/300'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-16T19:48:16Z'
---
# manager.DomEvent: fire() => add the receiver component as a param prop

use case:

multiple buttons use the same string based handler-function, which is defined inside a component controller.

adding the info which button was the target saves adding a lot of references & logic to figure it out.

will use the prop name "component", hoping it will never collide with any possible dom event prop name.

## Timeline

- 2020-03-16T19:47:27Z @tobiu added the `enhancement` label
- 2020-03-16T19:48:07Z @tobiu referenced in commit `3aefdb4` - "manager.DomEvent: fire() => add the receiver component as a param prop #300"
### @tobiu - 2020-03-16T19:48:16Z

done.

- 2020-03-16T19:48:16Z @tobiu closed this issue

