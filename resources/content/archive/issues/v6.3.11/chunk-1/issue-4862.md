---
id: 4862
title: 'table.View: pass the table.Container instance as a param to the renderer'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-07T18:44:54Z'
updatedAt: '2023-09-07T18:45:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4862'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-07T18:45:56Z'
---
# table.View: pass the table.Container instance as a param to the renderer

in case we want to use static renderer functions inside a util class, it can be helpful to get the instance. e.g. when creating cell-based component, which needs the current `appName` config (browser window reference).

@albert-hashani 

## Timeline

- 2023-09-07T18:44:54Z @tobiu added the `enhancement` label
- 2023-09-07T18:44:55Z @tobiu assigned to @tobiu
- 2023-09-07T18:45:41Z @tobiu referenced in commit `7e57948` - "table.View: pass the table.Container instance as a param to the renderer #4862"
- 2023-09-07T18:45:56Z @tobiu closed this issue

