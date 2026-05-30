---
id: 6090
title: 'core.Base, component.Base: allow unregistering existing components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-11-07T20:36:31Z'
updatedAt: '2024-11-07T20:41:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6090'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-07T20:41:05Z'
---
# core.Base, component.Base: allow unregistering existing components

advanced feature for devs who know what they are doing.

example: component based list with index based items => when adding new items or sorting, it can happen that ids get moved around. in this context it can briefly happen that ids are no longer unique until the sync OP is done.

the framework should not restrict it.

## Timeline

- 2024-11-07T20:36:31Z @tobiu added the `enhancement` label
- 2024-11-07T20:36:31Z @tobiu assigned to @tobiu
### @tobiu - 2024-11-07T20:41:05Z

wrong commit message, apologies.

the ticket got resolved via: https://github.com/neomjs/neo/commit/7d3a8dcf31e725c3a1605a48bc874df29805a754

- 2024-11-07T20:41:05Z @tobiu closed this issue

