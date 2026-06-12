---
id: 4557
title: 'manager.DomEvent: fire() => data.component not always pointing to the right instance'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-07-24T13:45:34Z'
updatedAt: '2023-07-24T22:58:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4557'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-07-24T22:58:03Z'
---
# manager.DomEvent: fire() => data.component not always pointing to the right instance

in case we do have multiple listeners for one component path, it can happen that the component gets replaced by reference.

to ensure this won't happen, we should clone the data object.

## Timeline

- 2023-07-24T13:45:35Z @tobiu added the `bug` label
- 2023-07-24T13:45:35Z @tobiu assigned to @tobiu
- 2023-07-24T13:45:50Z @tobiu referenced in commit `16bc12e` - "manager.DomEvent: fire() => data.component not always pointing to the right instance #4557"
- 2023-07-24T13:47:18Z @tobiu closed this issue
- 2023-07-24T22:57:12Z @tobiu reopened this issue
- 2023-07-24T22:57:33Z @tobiu referenced in commit `44a4382` - "manager.DomEvent: fire() => data.component not always pointing to the right instance #4557"
### @tobiu - 2023-07-24T22:58:03Z

the logic was accidentally cloning neo instances. resolved now.

- 2023-07-24T22:58:03Z @tobiu closed this issue

