---
id: 2801
title: 'plugin.Base: construct()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-08T13:07:43Z'
updatedAt: '2022-01-08T13:08:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2801'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-08T13:08:23Z'
---
# plugin.Base: construct()

In case we are lazy loading plugins, `construct()` can get triggered after the owner component got mounted. We need to manually trigger `onOwnerMounted()` in this case.

## Timeline

- 2022-01-08T13:07:43Z @tobiu added the `enhancement` label
- 2022-01-08T13:07:43Z @tobiu assigned to @tobiu
- 2022-01-08T13:08:13Z @tobiu referenced in commit `52b04ee` - "plugin.Base: construct() #2801"
- 2022-01-08T13:08:23Z @tobiu closed this issue

