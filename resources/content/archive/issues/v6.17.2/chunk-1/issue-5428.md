---
id: 5428
title: Update the webpack server config to work with node v22.x
state: CLOSED
labels:
  - bug
  - enhancement
assignees:
  - tobiu
createdAt: '2024-06-20T10:01:28Z'
updatedAt: '2024-06-20T10:02:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5428'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-20T10:02:08Z'
---
# Update the webpack server config to work with node v22.x

with node v22, the amount of internally used node_modules for build-script dependencies has grown a lot.

we need to disable the static file watching for it.

## Timeline

- 2024-06-20T10:01:28Z @tobiu added the `bug` label
- 2024-06-20T10:01:29Z @tobiu added the `enhancement` label
- 2024-06-20T10:01:29Z @tobiu assigned to @tobiu
- 2024-06-20T10:01:53Z @tobiu referenced in commit `5f871df` - "Update the webpack server config to work with node v22.x #5428"
- 2024-06-20T10:02:08Z @tobiu closed this issue

