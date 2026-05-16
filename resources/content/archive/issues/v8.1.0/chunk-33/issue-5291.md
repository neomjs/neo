---
id: 5291
title: remove src/data/field
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-03T18:21:20Z'
updatedAt: '2024-03-03T18:29:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5291'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-03T18:29:02Z'
---
# remove src/data/field

the idea to use `data.Model` instances as records and `data.field.*` instances inside of these got dropped right from the start.

we use the `data.RecordFactory` instead to keep records as lightweight as possible.

while we might reconsider this in the future, right now we should just delete the folder to not confuse developers.

@ExtAnimal @Dinkh @maxrahder 

## Timeline

- 2024-03-03T18:21:20Z @tobiu added the `enhancement` label
- 2024-03-03T18:21:21Z @tobiu assigned to @tobiu
- 2024-03-03T18:22:12Z @tobiu referenced in commit `3d07dcf` - "remove src/data/field #5291"
- 2024-03-03T18:29:02Z @tobiu closed this issue
- 2024-03-26T16:29:38Z @tobiu referenced in commit `0b4fa5c` - "remove src/data/field #5291"

