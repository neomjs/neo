---
id: 5200
title: 'core.Base: add class identifiers'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-02-05T14:15:56Z'
updatedAt: '2024-02-09T12:31:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5200'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-09T12:31:46Z'
---
# core.Base: add class identifiers

follow up ticket for: https://github.com/neomjs/neo/issues/5199

once we have the ntypeChain in place, we can add flags to all instances. E.g.: `isButton: true`.

this should automatically get generated using `is`, capitalize(first entype char), camelCase version of the ntype string.

## Timeline

- 2024-02-05T14:15:56Z @tobiu added the `enhancement` label
- 2024-02-09T12:31:31Z @tobiu referenced in commit `21f025e` - "core.Base: add class identifiers #5200"
### @tobiu - 2024-02-09T12:31:46Z

this went directly into the `Neo` file.

- 2024-02-09T12:31:47Z @tobiu closed this issue
- 2024-03-26T16:29:29Z @tobiu referenced in commit `53eca70` - "core.Base: add class identifiers #5200"

