---
id: 3091
title: 'buildScripts/main: copy resources to the dist envs for workspace based envs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-05-22T16:15:23Z'
updatedAt: '2022-05-22T16:53:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3091'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-22T16:53:20Z'
---
# buildScripts/main: copy resources to the dist envs for workspace based envs

this feels handy for mocking-data in case we drop them into a resources folder inside our workspace. I am adding the logic into the main builds, since they get triggered way less often than the app worker builds.

we could create a separate script for this task if needed.

## Timeline

- 2022-05-22T16:15:23Z @tobiu added the `enhancement` label
- 2022-05-22T16:15:24Z @tobiu assigned to @tobiu
- 2022-05-22T16:15:43Z @tobiu referenced in commit `69fba82` - "buildScripts/main: copy resources to the dist envs for workspace based envs #3091"
### @tobiu - 2022-05-22T16:23:02Z

need to push a hotfix

- 2022-05-22T16:23:38Z @tobiu referenced in commit `c6f4370` - "buildScripts/main: copy resources to the dist envs for workspace based envs #3091 => fix for the missing isFile() fn"
- 2022-05-22T16:53:20Z @tobiu closed this issue

