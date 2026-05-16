---
id: 398
title: 'component.Helix: wheel event while rendering items'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2020-03-29T20:20:06Z'
updatedAt: '2020-03-30T12:01:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/398'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-30T12:01:42Z'
---
# component.Helix: wheel event while rendering items

throws JS errors. there needs to be a check if items are rendering and if so ignore the wheel event.

## Timeline

- 2020-03-29T20:20:06Z @tobiu added the `bug` label
- 2020-03-30T12:00:28Z @tobiu referenced in commit `da3e866` - "https://github.com/neomjs/neo/issues/398"
### @tobiu - 2020-03-30T12:01:42Z

there was more to it: the API load request could arrive before the helix got mounted and tried to create the items before this point.

this one is fixed now plus added a mousewheel lock for 0.5s when createItems() gets triggered.

- 2020-03-30T12:01:42Z @tobiu closed this issue

