---
id: 5163
title: 'controller.Base: defaultHash config'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-12-07T20:03:57Z'
updatedAt: '2023-12-07T21:39:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5163'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-07T21:39:08Z'
---
# controller.Base: defaultHash config

if an app starts without a hash value inside the url, it should be possible to use a default one.

this approach is superior compared to using `defaultRoute`, since we can ensure that there is no state change (e.g. instance recreation) when switch from an non-existent hash to the default one.

@ThorstenRaab 

## Timeline

- 2023-12-07T20:03:57Z @tobiu added the `enhancement` label
- 2023-12-07T20:03:57Z @tobiu assigned to @tobiu
- 2023-12-07T21:39:00Z @tobiu referenced in commit `ae9d41b` - "controller.Base: defaultHash config #5163"
- 2023-12-07T21:39:08Z @tobiu closed this issue

