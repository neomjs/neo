---
id: 3163
title: buildScripts/createApp => mainPath inside the workspace scope
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-06-17T07:18:30Z'
updatedAt: '2022-06-17T09:05:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3163'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-06-17T09:05:58Z'
---
# buildScripts/createApp => mainPath inside the workspace scope

the script does work fine within the framework scope (fork, clone),but the main path does not get adjusted inside the workspace based scope yet (needs to point to the node modules).

## Timeline

- 2022-06-17T07:18:30Z @tobiu added the `bug` label
- 2022-06-17T07:18:31Z @tobiu assigned to @tobiu
- 2022-06-17T09:05:54Z @tobiu referenced in commit `66eec67` - "buildScripts/createApp => mainPath inside the workspace scope #3163"
- 2022-06-17T09:05:59Z @tobiu closed this issue

