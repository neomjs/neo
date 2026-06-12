---
id: 3273
title: Set default headers for data-worker requests
state: CLOSED
labels:
  - enhancement
assignees:
  - davhm
createdAt: '2022-07-11T14:51:41Z'
updatedAt: '2022-07-12T07:31:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3273'
author: davhm
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-07-12T07:30:59Z'
---
# Set default headers for data-worker requests

_As_ a neo.mjs application developer,

_I want to_ be able to configure the `data-worker` so that it adds custom default headers to all its HTTP requests,

_so that_ my app can properly interact with RESTful APIs which f.e. need a Basic-Auth header.

## Timeline

- 2022-07-11T14:51:42Z @davhm assigned to @davhm
- 2022-07-11T14:51:59Z @davhm added the `enhancement` label
- 2022-07-11T14:59:48Z @davhm referenced in commit `6cf4c03` - "feat(default-headers): Set default headers for dataworker requests

- Expose setter method for remote method access from other realms/workers

Relates to: #3273"
### @tobiu - 2022-07-12T07:30:59Z

i think we can close this one (fixed).

- 2022-07-12T07:31:00Z @tobiu closed this issue

