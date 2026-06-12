---
id: 3862
title: Neo.applyClassConfig() => handle singletons and return the updates class or instance
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-01-15T01:38:23Z'
updatedAt: '2023-01-15T08:34:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3862'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-01-15T08:32:33Z'
---
# Neo.applyClassConfig() => handle singletons and return the updates class or instance

this will greatly reduce the code

## Timeline

- 2023-01-15T01:38:23Z @tobiu added the `enhancement` label
- 2023-01-15T01:38:23Z @tobiu assigned to @tobiu
- 2023-01-15T01:38:51Z @tobiu referenced in commit `8112020` - "Neo.applyClassConfig() => handle singletons and return the updates class or instance #3862 src folder"
- 2023-01-15T01:43:34Z @tobiu referenced in commit `79c68c0` - "#3862 data.RecordFactory fix => we need the reference to the instance"
### @tobiu - 2023-01-15T07:56:16Z

while the singleton changes are good, the default class changes decrease the performance due to the way module caching works. need to revert this part.

- 2023-01-15T07:56:30Z @tobiu referenced in commit `dfbc403` - "Revert "Neo.applyClassConfig() => handle singletons and return the updates class or instance #3862 src folder"

This reverts commit 811202072caa9bee0e7ff92687e71f45e2d61d95."
- 2023-01-15T08:17:32Z @tobiu referenced in commit `a0f62ae` - "#3862 re-adding the singleton changes"
### @tobiu - 2023-01-15T08:32:32Z

did some more testing. it does not seem to affect the performance. however, the IDE support for non singleton based changes gets  WAY worse:

<img width="815" alt="Screenshot 2023-01-15 at 09 29 23" src="https://user-images.githubusercontent.com/1177434/212531071-aca5aa12-c4a3-43f4-a45e-24250cf179a0.png">

<img width="824" alt="Screenshot 2023-01-15 at 09 29 42" src="https://user-images.githubusercontent.com/1177434/212530656-5c41595b-8aa9-4eea-8d6d-44f0a814546f.png">

i think we should just keep the current version.

- 2023-01-15T08:32:33Z @tobiu closed this issue

