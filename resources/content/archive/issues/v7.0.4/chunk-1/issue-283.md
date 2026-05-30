---
id: 283
title: 'buildScripts/create-app: view folder'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-03-15T11:52:54Z'
updatedAt: '2024-08-27T20:55:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/283'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-27T20:55:39Z'
---
# buildScripts/create-app: view folder

It would be cleaner to generate a view folder and move the MainContainer into it.

## Timeline

- 2020-03-15T11:52:54Z @tobiu added the `enhancement` label
### @tobiu - 2024-08-27T20:55:39Z

already resolved => `fs.writeFileSync(path.join(folder + '/view/MainContainer.mjs'), mainContainerContent);`

- 2024-08-27T20:55:39Z @tobiu closed this issue

