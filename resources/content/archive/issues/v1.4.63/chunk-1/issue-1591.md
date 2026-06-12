---
id: 1591
title: 'Neo classes: method order'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-26T11:58:53Z'
updatedAt: '2021-03-26T13:57:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1591'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-26T13:57:47Z'
---
# Neo classes: method order

I started with putting a few methods on top of each class: 
constructor, onConstructed, init, mergeConfig, getVdomRoot, getVnodeRoot.

At this point it feels rather confusing, so I will change this approach:
constructor first, all other methods in chronological (alphabetical) order. 

## Timeline

- 2021-03-26T11:58:53Z @tobiu added the `enhancement` label
- 2021-03-26T11:58:53Z @tobiu assigned to @tobiu
- 2021-03-26T12:01:05Z @tobiu referenced in commit `796bc9c` - "Neo classes: method order #1591"
- 2021-03-26T12:01:55Z @tobiu referenced in commit `5b964da` - "Neo classes: method order #1591"
- 2021-03-26T12:02:22Z @tobiu referenced in commit `7451968` - "Neo classes: method order #1591"
- 2021-03-26T12:03:26Z @tobiu referenced in commit `8775339` - "Neo classes: method order #1591"
- 2021-03-26T12:06:40Z @tobiu referenced in commit `6511406` - "Neo classes: method order #1591"
- 2021-03-26T12:19:08Z @tobiu referenced in commit `700374e` - "Neo classes: method order #1591"
- 2021-03-26T12:21:13Z @tobiu referenced in commit `1ae01cb` - "Neo classes: method order #1591"
- 2021-03-26T12:26:34Z @tobiu referenced in commit `f7af0e5` - "Neo classes: method order #1591"
- 2021-03-26T12:32:31Z @tobiu referenced in commit `1f47655` - "Neo classes: method order #1591"
- 2021-03-26T12:37:49Z @tobiu referenced in commit `cc70191` - "Neo classes: method order #1591"
- 2021-03-26T12:43:41Z @tobiu referenced in commit `264328e` - "Neo classes: method order #1591"
- 2021-03-26T12:49:24Z @tobiu referenced in commit `6a7e79b` - "Neo classes: method order #1591"
- 2021-03-26T12:55:03Z @tobiu referenced in commit `2631cf8` - "Neo classes: method order #1591"
- 2021-03-26T13:08:46Z @tobiu referenced in commit `1e64fb4` - "Neo classes: method order #1591"
- 2021-03-26T13:14:22Z @tobiu referenced in commit `aad07f9` - "Neo classes: method order #1591"
- 2021-03-26T13:24:15Z @tobiu referenced in commit `9fac4ee` - "Neo classes: method order #1591"
- 2021-03-26T13:35:05Z @tobiu referenced in commit `f812a54` - "Neo classes: method order #1591"
- 2021-03-26T13:43:28Z @tobiu referenced in commit `16dbab1` - "Neo classes: method order #1591"
- 2021-03-26T13:57:37Z @tobiu referenced in commit `09781ab` - "Neo classes: method order #1591"
- 2021-03-26T13:57:47Z @tobiu closed this issue

